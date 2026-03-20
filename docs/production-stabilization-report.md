# Production stabilization — implementation report

## 1. Summary of critical route work

Four Vercel server handlers orchestrate writes previously done as long client-side chains:

| Route | Purpose |
|-------|---------|
| `POST /api/commands/create-multi-offer` | Multi-apartment offer + reservations + lead creation/linking (send mode) |
| `POST /api/commands/create-direct-booking` | Direct booking: reservation + offer |
| `POST /api/commands/save-invoice` | Proforma/invoice save, optional PDF upload, offerIdSource verification, offer_items status update |
| `POST /api/commands/confirm-payment` | Payment proof + optional file + RPC + current proof |

Shared client: `services/commandClient.ts` (Bearer JWT, `X-Idempotency-Key`, timeouts). Shared server: `api/_lib/supabase-admin.ts`, `with-timeout.ts`, `command-auth.ts`, `idempotency.ts`, `commandDb.ts`.

`vercel.json` sets `maxDuration` (30s DB-heavy, 60s upload routes).

---

## 2. Authorization (per route)

**Common:** `requireCommandProfile(request)` reads `Authorization: Bearer <access_token>`, validates via `admin.auth.getUser(token)`, loads `profiles` (id, role, department, is_active, category_access). Inactive users → 403. No anonymous command execution.

| Route | Assertion |
|-------|-----------|
| create-multi-offer | `assertCanCreateOffers` — `super_manager`, `department === 'sales'`, or `category_access` includes `sales` |
| create-direct-booking | same as offers |
| save-invoice | `assertCanSaveInvoice` — `super_manager`, `department` sales/accounting, `role === 'manager'`, or sales category_access |
| confirm-payment | `assertCanConfirmPayment` — `super_manager`, sales/accounting dept, or sales category_access; plus `assertInvoiceExistsForConfirm` (proforma, exists) |

Service role is used **only after** these checks, for orchestration (RLS bypass where needed).

---

## 3. Idempotency

- **Ledger:** `command_idempotency` with `UNIQUE (user_id, command, idempotency_key)`. `resolveIdempotency` claims row, replays completed `result_json`, or returns conflict if key reused with different in-flight semantics. Failed rows allow retry with the same key.
- **Payment proofs:** partial unique index on `(invoice_id, idempotency_key)` where `idempotency_key IS NOT NULL` for confirm-payment row-level dedup.
- **Client-side stable keys:** Each critical flow (multi-offer, direct booking, invoice save, confirm payment) uses a `useRef<string | null>` that persists the idempotency key across retries within the same logical action. The key is only reset on success or when the modal/form is closed and reopened (new action). This means a retry after timeout reuses the same key, so the server either replays the completed result or re-claims a failed/stale row — preventing duplicate business objects.

---

## 4. Document partial-failure handling

### Invoice orchestration_status

The `invoices.orchestration_status` column implements a real state machine:

- **pending** — row inserted/updated, no file uploaded yet
- **uploaded** — PDF uploaded to storage, file_url written to row
- **finalized** — all steps complete, invoice is authoritative
- **failed** — a step after row creation failed; set on catch

On failure after storage upload, storage object removal is attempted (`removeStoragePaths`). On failure after row creation, `orchestration_status` is set to `failed` so the partial state is visible and deterministic. Legacy rows (before migration) have `NULL` orchestration_status.

### Confirm payment proof handling

- Proof row created → file uploaded → file_path written → RPC called → rpc_confirmed_at stamped → current proof set.
- If upload fails: proof row exists but has no file_path (visible partial state).
- If RPC fails after upload: proof row has file_path but no rpc_confirmed_at (visible partial state, retryable with same idempotency key).
- If upload succeeds but file_path DB update fails: storage object is removed, error propagated.
- Idempotency ledger records failure for observability.

---

## 5. Save lock + reload

- Account dashboard uses **per-flow** saving flags/refs (multi-offer, direct booking, invoice, payment) so one hung flow does not block others.
- Post-save `loadReservations` / `offersService.getAll` / related refreshes are **deferred** (`setTimeout(..., 0)`) so they do not extend the critical write await.

---

## 6. End-to-end flow coverage

### ConfirmPaymentModal

Fully migrated. The modal now:
1. Gathers form data (proformaId, documentNumber, optional PDF)
2. Sends a single `commandPostFormData` request to `/api/commands/confirm-payment`
3. Handles success/error UI
4. Triggers non-blocking `onConfirmed` callback

The old browser-side chain (`paymentProofsService.create` → `uploadPaymentProofFile` → `update` → `markInvoicePaidAndConfirmBooking` → `setCurrentProof`) has been completely removed. The `supabase` and `markInvoicePaidAndConfirmBooking` dead references are gone.

### Invoice save (handleSaveInvoice)

Fully migrated. The client wrapper now:
1. Gathers the invoice payload + optional PDF + optional offerItemId
2. Sends a single command request to `/api/commands/save-invoice`
3. Updates local state
4. Schedules non-blocking refresh

The old browser-side offerIdSource resolution (which did `offersService.getAll()`, `offersService.create()`, reservation matching) has been removed. The server route now handles offerIdSource verification and offer_items status update.

### Multi-offer (handleSaveMultiApartmentOffer)

Fully migrated. For send mode, lead creation and lead_id linking to offers is now handled server-side in `create-multi-offer`. The client no longer calls `createLeadFromRequest` or `offersService.updateLeadIdForOffers` for this flow.

### Direct booking (handleSaveDirectBookingFromCalendar)

Was already end-to-end. No changes needed beyond stable idempotency key.

---

## 7. Timeout coverage

All DB/RPC/storage operations in all four command routes are wrapped with `withTimeout`:
- `create-multi-offer`: RPC, reservation insert, offer insert, lead dedup/insert, lead linking
- `create-direct-booking`: reservation insert, RPC, offer insert
- `save-invoice`: existing check, offerIdSource verify, insert/update pending, upload, mark uploaded, finalize, mark failed, offer_items update
- `confirm-payment`: next doc number, existing proof check, proof insert, proof conflict recheck, upload, file metadata update, proof state check, booking lookup, RPC, rpc_confirmed_at stamp, current proof set/unset

---

## 8. Forms / accessibility

Touched components: `InvoiceModal`, `ConfirmPaymentModal`, `TaskCreateModal`, `AdminCalendar` (filters, new-task modal, task-detail assignee, chat message/file), `AccountDashboard` property search (`id="property-search"`, `name`, `aria-label`).

Pattern: stable `id` + `htmlFor` on labels, or `aria-label` where no visible label; `name` where appropriate; task "type" pickers use accessible buttons with `aria-expanded` / `aria-haspopup` where implemented.

---

## 9. Blank-tab / history

**Preserved (popup-safe async):**

- `BookingDetailsModal` — protocol + payment proof: `window.open('', '_blank')` then `openUebergabeProtocolFromBooking` / `openUrlInPreOpenedWindow`.
- `SalesCalendar` — same protocol pattern.

**Rationale:** Opening a real URL only after async work can be blocked by the popup blocker without a synchronous `window.open` in the click handler. Existing helpers already show an error if the auxiliary window is null.

**Unchanged:** Flows that already have a URL at click time continue to use `window.open(url, '_blank', 'noopener,noreferrer')`.

---

## 10. Blob URL / PDF preview

**Change:** Local blob PDF previews that used `<iframe src={blobUrl}>` or `<object data={blobUrl}>` were switched to **`<embed src={...} type="application/pdf">`** where applicable:

- `InvoiceModal`
- `AccountDashboard` — inventory invoice preview, property OCR, expense OCR, floor-plan/media staged PDF

**Not changed:** Previews that use **remote/signed** URLs in iframes (e.g. document viewer tiles) — not blob-partitioning targets.

**Verification:** `npm run build` passes. **Manual:** confirm PDF rendering, scroll/pagination, and console in Chrome (and ideally one other browser) after deploy.

---

## 11. Chrome Problems rollup

- Blob partitioned-URL warnings: **hypothesis** mitigated via `<embed>` on blob PDF surfaces; measure in production DevTools.
- Blank-tab "skippable history": **intentionally retained** for async protocol/proof opens to protect popup reliability.

---

## 12. Build / deploy

- `npm run build` passes.
- `npx tsc --noEmit` shows zero errors in stabilization-related files. Pre-existing errors in unrelated files remain.
- Apply migration `supabase/migrations/20260319120000_command_idempotency_and_doc_flow.sql` to the target Supabase project.
- Ensure Vercel env has service role + anon/publishable keys as used by `api/_lib/supabase-admin.ts`.

---

## 13. Remaining risks / deferred items

- **Manual verification required:** PDF embeds, blank-tab flows, and all critical flows listed in the manual checklist (Section 14) must be tested in a browser after deploy.
- **Pre-existing TypeScript errors:** ~60 pre-existing TS errors in `AccountDashboard.tsx`, `App.tsx`, `BookingDetailsModal.tsx`, `ChatModal.tsx`, and `api/protocols/*` are unrelated to stabilization work and were not introduced by this pass.
- **Other browser-side Supabase writes:** Flows outside the four critical paths (e.g. `handleAddRequest` lead creation, offer select/deselect in multi-apartment UI, reservation status updates) remain client-side. These are lower-risk read-modify-write patterns, not multi-step orchestration chains.

---

## 14. Manual verification checklist

After deploy, verify each flow in a browser:

- [ ] Create multi-apartment offer (draft mode)
- [ ] Create multi-apartment offer (send mode — verify lead created and linked)
- [ ] Add proforma with PDF
- [ ] Add final invoice with PDF
- [ ] Confirm payment with proof PDF
- [ ] Confirm payment without proof file
- [ ] Direct booking create from calendar
- [ ] Retry after timeout/failure for each critical flow (verify same idempotency key reused, no duplicate rows)
- [ ] Verify PDF embeds render correctly in Chrome
- [ ] Verify blank-tab protocol/proof opens still work
