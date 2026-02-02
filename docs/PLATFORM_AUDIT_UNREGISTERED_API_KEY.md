# Full Platform Audit + Fix "Unregistered API key" (Vercel + Supabase)

**Date:** 2026-02-02  
**Goal:** Determine why production login fails with `AuthApiError: Unregistered API key` (401) and apply minimal fix.

---

## 1) Audit: repo state + recent changes

**Mapbox/Leaflet removal confirmed:**
- `git log -n 5`: `73c998d` final Mapbox cleanup, `c973e5e` remove Sales Map + deps, `8cd59af` Supabase env single source, …
- `grep` for mapbox|leaflet|SalesMapOverlay|MAPBOX_TOKEN in src, vite.config.*, package.json: **zero matches**.

**Project type:** Vite SPA (not Next.js).
- `package.json` scripts: `dev: vite`, `build: vite build`, `preview: vite preview`.
- Entry: `src/index.tsx` → `./index.css`, `../App`.
- Config: `vite.config.ts` only; no next.config.

---

## 2) Audit: Supabase integration (code)

**A) Where Supabase client is created**

**File:** `utils/supabase/client.ts`

| Item | Value |
|------|--------|
| Env keys read | `process.env.NEXT_PUBLIC_SUPABASE_URL`, `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY` (and now fallback `process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) |
| Missing values | `if (!supabaseUrl \|\| !supabaseAnonKey)` → `throw new Error('Missing Supabase public key: set NEXT_PUBLIC_SUPABASE_ANON_KEY or ...')` |
| Passed to createClient | `createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession, autoRefreshToken, detectSessionInUrl, storage } })` |

**B) How Vite injects env**

**File:** `vite.config.ts`

- `define` injects at **build time**:
  - `process.env.NEXT_PUBLIC_SUPABASE_URL` → `JSON.stringify(env.NEXT_PUBLIC_SUPABASE_URL || '')`
  - `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY` → `JSON.stringify(env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '')`
  - `process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` → `JSON.stringify(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '')`
- `env` comes from `loadEnv(mode, process.cwd(), '')` (empty prefix = all env vars).
- **No** fallback in config to `SUPABASE_URL` / `SUPABASE_ANON_KEY` / other names; only the above.
- **Risk:** If on Vercel only `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is set (and not ANON_KEY), the prod bundle previously got empty anon key → 401. Now we fallback to PUBLISHABLE_KEY.

**C) Where signIn is called**

- **LoginPage** (`components/LoginPage.tsx`): `handleSubmit` → `await login(email, password)` (from `useWorker()`).
- **WorkerContext** (`contexts/WorkerContext.tsx`): `login` callback → `await supabase.auth.signInWithPassword({ email, password })` (line ~278).
- **supabase** instance: imported from `../utils/supabase/client` at top of WorkerContext. So the key used for auth is exactly the one from `utils/supabase/client.ts`.

---

## 3) Audit: env mismatch (Vercel vs code)

**Conclusion:**

- **Code reads:** `NEXT_PUBLIC_SUPABASE_ANON_KEY` (and now fallback `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`).
- **Vercel:** If only `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` was set (or anon key was wrong/other project/old key), then:
  - **Before fix:** Code used only ANON_KEY → build got `""` or wrong value → runtime sent wrong/empty key → 401 Unregistered API key.
  - **After fix:** Code uses ANON_KEY || PUBLISHABLE_KEY → if Vercel has PUBLISHABLE_KEY with correct anon/publishable value, auth works.

**Explicit statement:**  
Код зараз читає `NEXT_PUBLIC_SUPABASE_ANON_KEY` або (fallback) `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. На Vercel якщо було лише `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` або неправильне значення в ANON_KEY, то в runtime використовувався порожній або неправильний ключ → це дає 401 Unregistered API key.

---

## 4) Reproduce locally like production

- **Build + preview:** `npm run build && npm run preview` (uses same `define` as prod).
- **DEV-only diagnostic** (added in `utils/supabase/client.ts`):
  - In development (`import.meta.env.DEV` and browser), console logs:
    - `urlPreview` = first 30 characters of Supabase URL
    - `keyPreview` = first 6 + `...` + last 6 of key (masked)
    - `keySource` = `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` depending on which one was used
  - Full key is **not** logged.

---

## 5) Fix applied (minimal)

**Variant 1 (implemented):** Support both anon and publishable env names.

- **utils/supabase/client.ts:**  
  `supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`  
  Throw if both are empty; message mentions both variable names.
- **vite.config.ts:**  
  Added `process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to `define` so the fallback is available in the bundle.
- **DEV-only:** Log urlPreview (30 chars), keyPreview (first 6 + last 6 masked), keySource (which env key was used).

No changes to WorkerContext login logic, calendar, bookings, or UI (except this diagnostic in client).

---

## 6) Deliverables

**Root cause (one sentence):**  
На Vercel у runtime використовувався порожній або неправильний Supabase public key (anon/publishable), тому що або була вказана тільки змінна `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, або значення `NEXT_PUBLIC_SUPABASE_ANON_KEY` було неправильним/від іншого проєкту/старе.

**Exact code locations:**
- `utils/supabase/client.ts`: lines 3–8 (env read, throw), 10–17 (createClient), plus DEV log.
- `vite.config.ts`: lines 13–18 (`define` for NEXT_PUBLIC_SUPABASE_*).
- `contexts/WorkerContext.tsx`: line ~278 (`supabase.auth.signInWithPassword`).

**Exact fix steps (Vercel + Supabase + redeploy):**
1. **Supabase:** Project Settings → API → copy the **anon public** (or publishable) key for this project.
2. **Vercel:** Project → Settings → Environment Variables. Set **one** of:
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = that key, or  
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = that key  
   (and keep `NEXT_PUBLIC_SUPABASE_URL`). Remove any wrong/old values.
3. **Vercel:** Deployments → Redeploy (new build) so the new key is baked in.

**After fix:**  
`npm run build` passes. Login on Vercel should work once the correct anon/publishable key is set and a new deploy is done.
