# Command routes — production verification (post-ESM fix)

Use this after deploying the `.js` relative import fix. If responses are still 500, work through in order.

## 1. Redeploy and smoke-test (Vercel)

1. Push/deploy so Production has the latest `api/commands/*.ts` and `api/_lib/*.ts` imports ending in `.js`.
2. In the app, trigger flows that POST to:
   - `/api/commands/create-direct-booking`
   - `/api/commands/create-multi-offer`
   - `/api/commands/save-invoice`
   - `/api/commands/confirm-payment`
3. In **Vercel → Deployment → Logs**, filter by path `api/commands/`.  
   - If you see `ERR_MODULE_NOT_FOUND`, run locally: `npm run check:api-esm` and fix any reported paths.

## 2. Capture error body + log line (if still failing)

1. Browser **DevTools → Network** → failed POST → **Response** tab. Body is usually `{"error":"..."}`.
2. Match timestamp with Vercel function log for the same request (stack / message).

## 3. Supabase (production project)

Run in **SQL Editor** (same project as `SUPABASE_URL` / anon URL in the app):

```sql
-- Idempotency table (required by command routes)
select to_regclass('public.command_idempotency') as command_idempotency_regclass;

-- RPC used by create-* routes
select proname
from pg_proc
join pg_namespace n on n.oid = pronamespace
where n.nspname = 'public' and proname = 'get_next_offer_no';
```

- If `command_idempotency_regclass` is **null**, apply migration  
  `supabase/migrations/20260319120000_command_idempotency_and_doc_flow.sql` to this project.
- `get_next_offer_no` is defined in repo under  
  `supabase/migrations/20260311120000_extend_offers_multi_apartment.sql` — ensure that migration was applied too.

## 4. Vercel environment

For serverless API routes using the service role:

| Variable | Required |
|----------|----------|
| `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL` | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes |

Confirm **Production** (and Preview, if you test there) use the **same** Supabase project as the browser app. After changing env vars, **redeploy**.

## 5. Local guard before deploy

```bash
npm run check:api-esm
npm run build
```

Optional: `npx vercel build` (with Vercel CLI linked) to validate serverless compilation.

## 6. Stuck-flow triage addendum (UI appears hanging)

Capture these artifacts for each suspected stuck flow:

1. Browser **Network** record for the exact command request:
   - request URL/path
   - start/end timing
   - status code
   - response body
2. Browser **Console** lines around the same timestamp:
   - trace/idempotency related logs
   - modal close/reopen actions
3. Matching **Vercel function log** line for same route and time window.

How to classify quickly:

- **Server success + UI still blocked**: network `2xx` and Vercel success logs exist, but user remains in modal/next-step UI -> likely sequencing/stale-state issue.
- **Client timeout**: browser shows aborted request (`AbortError`/timeout message); check if server finished later using same idempotency key.
- **Backend error path**: network non-2xx with structured `{"error": ...}` body and matching server error log.
- **No server log match**: likely request never reached function (frontend/network/session problem).

Post-fix note:

- If UI close actions are disabled during in-flight save/confirm, treat this as intentional anti-stale-state behavior, not a new hang symptom. Validate completion using Network status plus matching command-route log line.
