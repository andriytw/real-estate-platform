# Operational rollout: `admin-create-user` + Pass 1 profiles migration

Use this after pulling the latest code. **Do not change app code** for rollout—only CLI + SQL + Dashboard checks.

## 1. Pass 1 migration (profiles access columns)

**File:** [`supabase/migrations/20260329120000_profiles_access_model_columns.sql`](../supabase/migrations/20260329120000_profiles_access_model_columns.sql)

Adds: `department_scope`, `can_manage_users`, `can_be_task_assignee` (idempotent `IF NOT EXISTS`).

**Apply via Supabase CLI (linked project):**

```bash
npx supabase@latest db push
```

**Or** paste/run the SQL in **Supabase Dashboard → SQL Editor** (safe to re-run: uses `ADD COLUMN IF NOT EXISTS`).

## 2. One-time unblock: Supabase CLI auth + link

If `npx supabase projects list` fails with “Access token not provided”:

```bash
npx supabase@latest login
```

Then link this repo to the correct project (get **Project ref** from Supabase Dashboard → Project Settings → General). This repo’s docs have referenced project ref **`qcpuzfhawcondygspiok`** — **confirm** in Dashboard before using.

```bash
cd /path/to/real-estate-platform
npx supabase@latest link --project-ref YOUR_PROJECT_REF
```

## 3. Deploy Edge Function `admin-create-user`

```bash
cd /path/to/real-estate-platform
npx supabase@latest functions deploy admin-create-user --project-ref YOUR_PROJECT_REF
```

If already linked, omit `--project-ref`.

**Runtime env (hosted Supabase):** The function reads `SUPABASE_URL` and `SERVICE_ROLE_KEY` or `SUPABASE_SERVICE_ROLE_KEY`. On Supabase-hosted Edge Functions, **URL + service role are typically injected**; if deploy logs show missing env, set **Project Settings → Edge Functions → Secrets** as needed (same names as in [`supabase/functions/admin-create-user/index.ts`](../supabase/functions/admin-create-user/index.ts)).

## 4. Verify database columns (SQL Editor)

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND column_name IN ('department_scope', 'can_manage_users', 'can_be_task_assignee')
ORDER BY column_name;
```

Expected: three rows.

## 5. Verify super admin `at@herorooms.de` can use User Management create

```sql
SELECT id, email, role, can_manage_users, department_scope, is_active
FROM public.profiles
WHERE lower(email) = lower('at@herorooms.de');
```

Expected for create-user flow: `can_manage_users = true` (and `is_active = true` if they should log in).

## 6. Verify frontend path

After deploy, the app calls:

`POST {NEXT_PUBLIC_SUPABASE_URL}/functions/v1/admin-create-user`

with `Authorization: Bearer <session access_token>` and JSON body (see [`services/supabaseService.ts`](../services/supabaseService.ts) `createUserWithPassword`).

## 7. UI smoke test

1. Log in as `at@herorooms.de` (or any user with `can_manage_users = true`).
2. **Admin → Користувачі** → **Створити користувача** → fill form + password + confirm.
3. Confirm new user appears in table; log out and log in **in incognito** as the new user with email + password.
