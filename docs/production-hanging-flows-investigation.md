# Production Hanging Flows Investigation

## Scope / guardrails

- Investigation-only phase for stuck/hanging UX in:
  - direct booking from calendar
  - multi-offer save/send
  - proforma/invoice save/upload
  - confirm payment with/without PDF
- No fixes implemented in this phase.
- No changes to auth/permission cleanup work; Track C remains paused after 4K2.5b.
- No changes to:
  - `api/_lib/server-permissions.ts`
  - `api/_lib/command-auth.ts`

## Hypothesis matrix

| Hypothesis | What would look like a hang | Current code signal | Initial confidence |
|---|---|---|---|
| UI stale lock (ref/state not reset) | Click ignored, button stays disabled, no new request | per-flow `*SaveInProgressRef` guards and modal local loading states | medium |
| Modal sequencing dependency | Save succeeded but user still sees pending next step | `SendChannelModal` closes flow only on its own close callback | high |
| Timeout/retry confusion | User sees timeout, retries, original request may still finish | `Promise.race` timeout in `MultiApartmentOfferModal` does not cancel underlying request | high |
| Server latency | Long wait before response or timeout | `commandClient` 90s/120s AbortController timeouts | medium |
| Backend error path | Request fails but UI message looks like indefinite wait | catch/alert paths vary across flows | medium |
| Not reproducible from code alone | No deterministic stall path without runtime traces | several branches require live timing + logs correlation | medium |

## Per-flow control-flow maps

### 1) Direct booking from calendar

- Entry: `MultiApartmentOfferModal` in `directBookingMode`, button `Create booking` -> `handleSubmit('directBooking')`.
- Local loading state: `savingMode='directBooking'` in modal.
- Parent lock: `directBookingSaveInProgressRef.current=true` in `handleSaveDirectBookingFromCalendar`.
- Idempotency: `directBookingIdempotencyKeyRef` reused per logical action; passed as `X-Idempotency-Key`.
- API call: `commandPostJson('/api/commands/create-direct-booking', ...)`.
- Success path: prepend offer, set send-channel payload, close-on-send callback.
- Error path: alert with `CommandClientError` message.
- Unlock path: parent `finally` resets `directBookingSaveInProgressRef`; modal `finally` clears `savingMode`.
- Close path: modal close during save triggers `onStuckClearLock` (global lock clear escape hatch).
- Follow-up dependency: yes, send-channel modal flow.

### 2) Multi-offer save

- Entry: `MultiApartmentOfferModal` save/send control uses `handleSubmit`.
- Local loading state: `savingMode='send'` (UI has one submit branch for non-direct mode).
- Parent lock: `multiOfferSaveInProgressRef.current=true` in `handleSaveMultiApartmentOffer`.
- Idempotency: `multiOfferIdempotencyKeyRef` reused for retries in same action.
- API call: `commandPostJson('/api/commands/create-multi-offer', { draft, mode })`.
- Success path (`mode='draft'`): set sales tab and refresh data.
- Error path: toast + rethrow to modal handler.
- Unlock path: parent `finally` resets lock; modal `finally` clears `savingMode`.
- Close path: while saving, close triggers global lock clear callback.
- Follow-up dependency: no for pure draft save.

### 3) Multi-offer send

- Same as flow 2 until success.
- Success path (`mode='send'`): sets `sendChannelPayload`; close action is deferred to `SendChannelModal` `onClose` callback.
- Potential perceived hang: save completed but user is blocked in send-channel step.
- Unlock path still in parent/modal `finally`.
- Follow-up dependency: yes (primary).

### 4) Invoice/proforma save without upload

- Entry: `InvoiceModal` save buttons -> `handleSave('save'|'send')`.
- Local loading states: `saving=true`, `uploading=false`.
- Parent lock: `invoiceSaveInProgressRef.current=true` in `handleSaveInvoice`.
- Idempotency: `invoiceIdempotencyKeyRef` stable during action.
- API call: `commandPostJson('/api/commands/save-invoice', ...)`.
- Success path:
  - non-send: close invoice modal and route to invoices/proformas tabs.
  - proforma send: open `SendChannelModal`.
- Error path: alert with normalized message.
- Unlock path: parent `finally` resets lock; modal `finally` clears `saving/uploading`.
- Close path: `onAbandonStuck('persist')` can force-clear parent lock and remount modal.
- Follow-up dependency: yes for proforma send only.

### 5) Invoice/proforma save with PDF upload

- Same as flow 4 with `pdfFile` present.
- Local loading states: `uploading=true`, then `saving=true`.
- API call: `commandPostFormData('/api/commands/save-invoice', fd, ...)`.
- Timeout layer: upload path uses longer `commandClient` timeout (120s).
- Close path while uploading: `onAbandonStuck('upload')` closes/remounts modal; parent lock may remain if request still active.
- Follow-up dependency: same as flow 4.

### 6) Confirm payment without PDF

- Entry: `ConfirmPaymentModal` -> `handleSaveAndConfirm`.
- Local loading state: `uploading=true` (same state used with/without file).
- Idempotency: `idempotencyKeyRef` persisted in modal; reset on success/close.
- API call: `commandPostFormData('/api/commands/confirm-payment', fd, ...)`.
- Success path: `onConfirmed(bookingId)` then close/reset.
- Error path: detailed error text based on `kind` + parsed body.
- Unlock path: modal `finally` resets `uploading`.
- Follow-up dependency: no send-channel dependency.

### 7) Confirm payment with PDF

- Same as flow 6, with `fd.append('file', pdf)`.
- Additional stall surface: larger upload payload + 120s timeout.
- Unlock and error handling identical.

## Lock-reset audit

### AccountDashboard per-flow locks

- `multiOfferSaveInProgressRef`, `directBookingSaveInProgressRef`, `invoiceSaveInProgressRef` are set before API calls and reset in `finally` blocks in each corresponding handler.
- There is a global escape hatch `onStuckClearAccountDashboardSaveLock()` that clears **all** three locks.

### Modal local states

- `MultiApartmentOfferModal`: `savingMode` set before request, reset in `finally`.
- `InvoiceModal`: `uploading`/`saving` reset in `finally`; has `onAbandonStuck` to force-close.
- `ConfirmPaymentModal`: `uploading` reset in `finally`.

### Lock-safety conclusions

- No obvious static path where parent per-flow lock remains true after normal `try/catch/finally`.
- Perceived stuck risk exists when user closes a modal while request is still in flight and then retries, because forced unlock/remount can obscure whether prior request eventually succeeded.
- Global lock clear can remove unrelated in-progress guard state, which is useful operationally but can blur causality during triage.

## Timeout audit

| Layer | Location | Value | Classification |
|---|---|---:|---|
| JSON command timeout | `commandPostJson` | 90s | baseline |
| FormData upload timeout | `commandPostFormData` | 120s | baseline upload |
| Modal timeout guard | `MultiApartmentOfferModal` `Promise.race` | 90s | potentially conflicting (does not cancel parent request) |
| Upload/persist labels | `InvoiceModal` | state-only | UI-only indicator |

### Timeout layering conclusions

- Direct booking / multi-offer / invoice JSON paths are aligned with 90s command timeout.
- Upload paths use 120s; expected longer waits can be interpreted as hang without progress UI.
- `MultiApartmentOfferModal` timeout guard is the strongest mismatch: timeout clears UI and lock via callback but underlying request may still complete later.

## Send-channel dependency audit

- `handleSaveDirectBookingFromCalendar`, `handleSaveMultiApartmentOffer(mode='send')`, and `handleSaveInvoice` for proforma-send set `sendChannelPayload` and defer full completion UX to `SendChannelModal` close callback.
- This creates a valid sequencing dependency: backend save may already be complete while UI still expects user action in channel picker.
- High chance of user interpreting this as a stalled save if transition messaging is unclear.

## Findings table

| Flow | Primary entry point | Reproducer status | Suspected hang class | High-confidence root cause? | Evidence source | Affected file(s) | Affected function(s) | Candidate fix scope | Fix risk | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| Direct booking from calendar | `MultiApartmentOfferModal` -> `handleSaveDirectBookingFromCalendar` | reproducible path in code, runtime correlation needed | sequencing dependency / stale-state after forced close | no | code audit | `components/MultiApartmentOfferModal.tsx`, `components/AccountDashboard.tsx` | `handleSubmit`, `handleSaveDirectBookingFromCalendar` | improve progress messaging + close behavior contracts | medium | save success may wait behind send-channel action |
| Multi-offer save | `MultiApartmentOfferModal` -> `handleSaveMultiApartmentOffer(mode='draft')` | reproducible path in code, runtime traces pending | timeout/retry confusion | yes | code audit | `components/MultiApartmentOfferModal.tsx`, `components/AccountDashboard.tsx` | `handleSubmit`, `handleSaveMultiApartmentOffer` | unify timeout ownership; avoid uncancelled race timeout | medium | modal timeout can fire while parent request still in flight |
| Multi-offer send | same with `mode='send'` | reproducible path in code, runtime traces pending | sequencing dependency + timeout layering | yes | code audit | same as above + `SendChannelModal` wiring in dashboard | same | explicit stage indicator (saved vs awaiting send) | low-medium | likely perceived hang, not backend stall |
| Invoice/proforma save without upload | `InvoiceModal` -> `handleSaveInvoice` JSON path | reproducible path in code, live evidence needed | stale-state on close/reopen / sequencing dependency (send only) | no | code audit | `components/InvoiceModal.tsx`, `components/AccountDashboard.tsx` | `handleSave`, `handleSaveInvoice` | tighten abandon semantics + success visibility | medium | forced abandon can hide late success |
| Invoice/proforma save with PDF upload | `InvoiceModal` upload path | reproducible path in code, live evidence needed | server latency perception + stale-state after abandon | no | code audit | same + `services/commandClient.ts` | `handleSave`, `commandPostFormData` | add progress telemetry and completion reconciliation UX | medium | 120s timeout with large uploads can look frozen |
| Confirm payment without PDF | `ConfirmPaymentModal` -> `handleSaveAndConfirm` | not reproducible from current code evidence | backend latency/error or live-only issue | no | code audit | `components/ConfirmPaymentModal.tsx`, `services/commandClient.ts` | `handleSaveAndConfirm`, `commandPostFormData` | live trace correlation first | low | local state cleanup in finally appears safe |
| Confirm payment with PDF | same with attached PDF | not reproducible from current code evidence | upload latency perception | no | code audit | same | same | live capture first; evaluate payload-size UX later | low-medium | no static deadlock path identified |

## Root-cause ranking

| Rank | Root cause | Confidence | Flows impacted | Why it fits evidence | Target fix phase |
|---:|---|---|---|---|---|
| 1 | Timeout ownership mismatch (`Promise.race` timeout in modal without request cancellation) | high | multi-offer save/send, direct-booking modal behavior | explicit comment + code path where UI timeout can win while request continues | phase 1 UX/control-flow hardening |
| 2 | Save-success but UI waiting on send-channel step interpreted as hang | high | direct booking, multi-offer send, proforma send | save handlers intentionally defer closure to send modal on-close callback | phase 1 UX staging clarity |
| 3 | Abandon/remount escape hatch can hide late success and create retry confusion | medium | invoice/proforma save (esp upload), multi-offer/direct booking when manually closed | forced unlock/remount is diagnostic escape hatch, not transactional reconciliation | phase 2 resilience/reconciliation |
| 4 | Long upload/server latency without explicit progress granularity | medium | invoice/proforma with PDF, confirm-payment with PDF | 120s timeout, single busy label, no intermediate milestone feedback | phase 2 UX observability |
| 5 | Backend error path misread as hang due sparse correlation | low-medium | all command flows | trace id/idempotency exists but not surfaced to user-facing diagnostics | phase 2 diagnostics tooling |

## Missing evidence / next live capture requirements

- For any user-reported hang, capture:
  - browser network entry (request start/end, status, response body)
  - browser console logs around trace/idempotency and modal close action
  - matching Vercel function log line for same timestamp/path
- Required to disambiguate:
  - true server stall vs successful save + UI sequencing wait
  - timeout-induced retry confusion vs backend error
- Flows currently marked "not reproducible from current code evidence" require live trace correlation before selecting fixes.

## Proposed fix phase split (not implemented here)

### Phase A: control-flow and UX clarity
- Single source of timeout ownership per flow.
- Explicit UI stage messages: `Saving`, `Saved`, `Awaiting send-channel action`.
- Prevent ambiguous close while in-flight unless state is reconciled.

### Phase B: diagnostics and reconciliation
- Correlation surface for trace/idempotency in user-visible error details.
- Re-entry reconciliation after abandoned modal (detect late success and refresh state).
- Optional richer upload progress indication for long-running FormData paths.

## Implementation Follow-up (bounded fix phase)

### Root causes fixed in code

- Timeout ownership mismatch for multi-offer/direct-booking modal guard:
  - `MultiApartmentOfferModal` now uses shared command timeout constant from command client and clears timeout handles on completion.
- Scoped stale-lock reset behavior:
  - `AccountDashboard` stuck-clear path now supports per-flow reset (`multiOffer`, `directBooking`, `invoice`) and clears matching idempotency keys, avoiding broad cross-flow unlock side effects.
- Sequencing/close determinism improvements:
  - `ConfirmPaymentModal` blocks close while request is in-flight.
  - `InvoiceModal` save/send buttons are consistently disabled while any save/upload is active.

### Files changed

- `services/commandClient.ts`
- `components/MultiApartmentOfferModal.tsx`
- `components/AccountDashboard.tsx`
- `components/InvoiceModal.tsx`
- `components/ConfirmPaymentModal.tsx`

### Flows covered by implementation

- Direct booking from calendar
- Multi-offer save
- Multi-offer send
- Invoice/proforma save without upload
- Invoice/proforma save with PDF upload
- Confirm payment without PDF
- Confirm payment with PDF

### Deferred / still live-correlation dependent

- End-to-end confirmation of reduced perceived hanging under production latency requires live browser+Vercel correlation captures.
- Rich upload progress granularity remains deferred (no broad UX refactor in this bounded phase).
