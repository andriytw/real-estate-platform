# confirm-payment — Phase 1 gate (after deploy)

Run this **after** the revision with observability (normalized errors + step logs) is deployed. **Do not** apply the Phase 2 RPC migration until this gate is satisfied.

## Steps

1. **Redeploy** production (or staging) so Vercel runs the latest `api/commands/confirm-payment.ts` + client bundle.

2. **Reproduce** failure with **no PDF**: Account → confirm payment → Save & Confirm without attaching a file (same scenario as before).

3. **Vercel → Logs** (filter path `confirm-payment`):
   - Find the last line `[confirm-payment] step=...:start` **before** `[confirm-payment] step=...:error`.
   - That `step` name is the **failing step** (e.g. `rpc-confirm`, `proof-row`, `idempotency`).

4. **Browser → Network** → failed `POST .../api/commands/confirm-payment` → **Response**:
   - Copy JSON: `error`, `step`, `code`, `details` (should be human-readable, not `[object Object]`).

## Record (ticket / note)

| Field | Value |
|-------|--------|
| Failing step | _e.g. rpc-confirm_ |
| Error text | _paste `error` + `details`_ |

## Phase 2 decision

- If **step = `rpc-confirm`** **and** the message indicates **access / permission denied** (e.g. matches the RPC’s “Only accounting or sales…” exception): proceed with the **conditional** Supabase migration (service_role allowance in `mark_invoice_paid_and_confirm_booking`).
- Otherwise: **do not** apply that migration; fix the layer indicated by the captured step and message.
