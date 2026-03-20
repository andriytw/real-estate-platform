# Production stabilization — implementation report

## 1. Summary of critical route work

Four Vercel server handlers orchestrate writes previously done as long client-side chains:

| Route | Purpose |
|-------|---------|
| `POST /api/commands/create-multi-offer` | Multi-apartment offer + reservations + lead creation/linking (send mode) |
| `POST /api/commands/create-direct-booking` | Direct booking: reservation + offer |
| `POST /api/commands/save-invoice` | Proforma/invoice save, optional PDF, offerIdSource verification, linked **reservation → invoiced**, offer_items update |
| `POST /api/commands/confirm-payment` | Payment proof + optional file + RPC + current proof; optional **`existingProofId`** for retry without duplicate proof rows |

Shared client: `services/commandClient.ts` (Bearer JWT, `X-Idempotency-Key`, timeouts). Shared server: `api/_lib/supabase-admin.ts`, `with-timeout.ts`, `command-auth.ts`, `idempotency.ts`, `commandDb.ts`.

`vercel.json` sets `maxDuration` (30s DB-heavy, 60s upload routes).

---

## 2. Authorization (per route)

**Common:** `requireCommandProfile(request)` reads `Authorization: Bearer <access_token>`, validates via `admin.auth.getUser(token)` (bounded by `withTimeout`), loads `profiles` (same). Inactive users → 403.

| Route | Assertion |
|-------|-----------|
| create-multi-offer | `assertCanCreateOffers` |
| create-direct-booking | same |
| save-invoice | `assertCanSaveInvoice` |
| confirm-payment | `assertCanConfirmPayment` + `assertInvoiceExistsForConfirm` (unpaid invoice; document_type `proforma`, `invoice`, or null — not arbitrary types) |

Service role is used **only after** these checks.

---

## 3. Idempotency

- **Ledger:** `command_idempotency` with `UNIQUE (user_id, command, idempotency_key)`. All ledger **insert/select/update** paths use `withTimeout` ([`api/_lib/idempotency.ts`](api/_lib/idempotency.ts)).
- **Payment proofs:** partial unique index on `(invoice_id, idempotency_key)` when set.
- **Invoice save (`AccountDashboard`):** `invoiceIdempotencyKeyRef` holds the key for the current modal session. It is **cleared on successful save** and **cleared when `InvoiceModal` closes or abandons** (`onClose` / `onAbandonStuck`), so a **new modal session gets a new key** while **retry after error/timeout without closing** reuses the same key.
- **Confirm payment (modal):** stable ref per open session; reset on close/success.
- **Dashboard quick actions (toggle paid, confirm proforma, retry proof):** each invocation uses a **new** random idempotency key (each click is a distinct logical action). Retry proof uses form field **`existingProofId`** so the server reuses the existing proof row instead of inserting another.

---

## 4. Document partial-failure handling

### Invoice orchestration_status

Same as before: `pending` → `uploaded` (if new PDF in this request) → `finalized` / `failed`. If finalize or post-finalize steps fail while `pendingInvoiceId` is still set, catch marks `failed`.

### Linked reservation after invoice save

After invoice finalize, `save-invoice` updates `reservations.status` to **`invoiced`** when the payload has a UUID `reservationId` or `bookingId` (client historically uses `bookingId` for reservation id). The client no longer calls `updateReservationInDB` in the save-invoice success path; it may **`loadReservations`** read-only refresh.

### Confirm payment

- Optional **`existingProofId`** (multipart field): load proof by id, verify `invoice_id`, then run upload (if any) + RPC path without inserting a second proof for the same retry.
- Storage cleanup steps use bounded `withTimeout` where added.

---

## 5. Save lock + reload

- Per-flow flags: multi-offer, direct booking, invoice save. Confirm-payment modal uses local `uploading` state (no separate Dashboard ref).
- Post-save / post-command reloads remain deferred (`setTimeout(..., 0)`).

---

## 6. Unified payment confirmation (no AccountDashboard RPC bypass)

**Single authoritative write path** for “mark paid / confirm booking” via server: `POST /api/commands/confirm-payment`.

| UI entry | Implementation |
|----------|------------------|
| `ConfirmPaymentModal` | `commandPostFormData` → confirm-payment |
| Quick confirm proforma (`handleConfirmProformaPayment`) | `confirmProformaPaymentViaCommand` → same route |
| Accounting **toggle status to Paid** (`toggleInvoiceStatus`) | same helper + `refreshDataAfterPaymentConfirmed` |
| **Retry proof RPC** (`handleRetryProofConfirmation`) | same route + `existingProofId: proof.id` |

`AccountDashboard` **does not** import or call `markInvoicePaidAndConfirmBooking`. The function may still exist in [`services/supabaseService.ts`](services/supabaseService.ts) for legacy or tooling; production UI for these flows goes through the command route.

---

## 7. Invoice save — fully authoritative command

Client `handleSaveInvoice`: one `commandPostJson` / `commandPostFormData` to `save-invoice` only (no post-success reservation writes). Server owns offer_items update, reservation `invoiced` when applicable, PDF, orchestration_status.

---

## 8. Timeout coverage (command stack)

- **`requireCommandProfile` / `assertInvoiceExistsForConfirm`:** `withTimeout` on `getUser` and DB reads ([`api/_lib/command-auth.ts`](api/_lib/command-auth.ts)).
- **`idempotency.ts`:** all operations wrapped ([`api/_lib/idempotency.ts`](api/_lib/idempotency.ts)).
- **Routes:** DB/RPC/upload as before; **rollback `reservations.delete`** in `create-multi-offer` and `create-direct-booking` wrapped; **`save-invoice`** `removeStoragePaths` and catch-path invoice update wrapped; **confirm-payment** storage remove paths wrapped.

---

## 9. Forms / accessibility

Unchanged from prior pass (InvoiceModal, ConfirmPaymentModal, TaskCreateModal, AdminCalendar, property search).

---

## 10. Blank-tab / history

Unchanged — popup-safe patterns retained in `BookingDetailsModal` / `SalesCalendar`.

---

## 11. Blob URL / PDF preview

Unchanged — local blob PDFs use `<embed>` where applied; remote URLs may remain in `<iframe>`.

---

## 12. Build / typecheck

- **`npm run build`:** passes (run after changes).
- **`npx tsc --noEmit`:** **fails globally** due to large pre-existing debt (hundreds of errors across `AccountDashboard.tsx`, `App.tsx`, Next utils, protocols, etc.). **Stabilization-specific files** (`api/commands/*`, `api/_lib/command-auth.ts`, `api/_lib/idempotency.ts`, `api/commands/confirm-payment.ts`, `api/commands/save-invoice.ts`) do not introduce new errors in isolation; `AccountDashboard` still participates in global failures from unrelated lines.

---

## 13. Remaining caveats

- **`offer_items` update** after proforma save: still **non-fatal** on the server (logged); invoice row is still finalized — rare inconsistency if DB update fails.
- **Global `tsc`:** not green until broader repo typing is fixed.
- **Manual QA:** required — see §14.

---

## 14. Manual verification checklist

- [ ] Confirm payment from **ConfirmPaymentModal** (with / without PDF)
- [ ] **Quick confirm** proforma (`handleConfirmProformaPayment`)
- [ ] **Accounting invoices table:** toggle row to **Paid** (uses command route; proforma or final invoice with `offer_id`)
- [ ] **Retry confirmation** on existing proof row (`existingProofId` path)
- [ ] Save invoice / proforma end-to-end; reservation shows **invoiced** after save when `bookingId`/reservation link present
- [ ] Retry invoice save after failure/timeout **without closing modal** → same idempotency key
- [ ] Close invoice modal **without success**, reopen, save → **new** idempotency key
- [ ] Multi-offer, direct booking, idempotent retries (no duplicate rows where ledger applies)
- [ ] PDF embeds + blank-tab protocol flows (regression smoke)
