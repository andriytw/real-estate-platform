# "Unregistered API key" (Supabase Auth) — Analysis & Fix

**Context:** Login fails on production (Vercel) with `AuthApiError: Unregistered API key` and 401 during `signInWithPassword`. UI loads → URL is correct; only auth fails → key-level issue.

---

## 1) Which API key is used at runtime

**File:** `utils/supabase/client.ts`

- **Env used for anon key:** `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY` (line 4). No `import.meta.env` or `VITE_*` in this file.
- **Flow:** At **build time**, Vite replaces `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY` with the value from `vite.config.ts` → `define: { 'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': JSON.stringify(env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '') }`. So the value in the built JS is whatever `loadEnv(mode, process.cwd(), '')` saw when `vite build` ran (on Vercel = Vercel env vars).
- **Result:** `createClient(supabaseUrl, supabaseAnonKey, ...)` receives:
  - `supabaseUrl` = value of `NEXT_PUBLIC_SUPABASE_URL` at build time
  - `supabaseAnonKey` = value of `NEXT_PUBLIC_SUPABASE_ANON_KEY` at build time

**Can `supabaseAnonKey` be wrong?**

- **undefined:** No. Vite `define` injects a string; if the env var is missing, it becomes `JSON.stringify('')` → `""`.
- **empty string:** Yes. If `NEXT_PUBLIC_SUPABASE_ANON_KEY` is not set on Vercel, the client gets `""`. Then `if (!supabaseAnonKey)` would throw before `createClient`, so the app would not load. Since the login page loads, the key is non-empty at module load → so it is **set but wrong** (wrong value), not missing.
- **wrong key:** Yes. Most likely: value on Vercel is **service_role**, key from **another project**, **old/regenerated** anon key, or **typo**.

---

## 2) Expected key vs Supabase project keys

| Key type | Use in frontend? | Notes |
|----------|------------------|--------|
| **anon (public)** | ✅ **Must use** | Safe to expose; used for Auth (signIn, signUp, etc.) and RLS. Label in Dashboard: "anon" / "public". |
| **service_role** | ❌ **Must NOT** | Server-only; bypasses RLS. Using it in the browser is a security risk and can be rejected (401 / Unregistered). |
| **JWT secret** | ❌ **Must NOT** | Used to sign tokens; never send to client. |
| **sb_publishable_*** (new format) | ✅ If auth-enabled | New publishable keys; use the one that matches your project and is marked for client/auth. |

**What "Unregistered API key" means:** Supabase received the request but the `apikey` (or the JWT derived from it) is **not recognized** as a valid key for that project: wrong key, key from another project, revoked/regenerated key, or malformed/typo.

---

## 3) Supabase project configuration (logic-level)

| Cause | Produces 401 + Unregistered? |
|-------|------------------------------|
| Key from **different** Supabase project (URL = project A, key = project B) | ✅ Yes |
| Keys **regenerated** in Dashboard; Vercel still has old key | ✅ Yes |
| **service_role** used in frontend | ✅ Yes (rejected or treated as invalid) |
| Project **paused** (free tier) | ✅ Can do (401 / auth disabled until resumed) |
| Auth **disabled** or misconfigured | Possible (different error possible) |
| **Typo** or truncated key in env | ✅ Yes |

Since the UI loads, URL is correct and the project is reachable. So the failure is almost certainly the **value** of `NEXT_PUBLIC_SUPABASE_ANON_KEY` on Vercel: wrong key type, wrong project, or outdated/regenerated key.

---

## 4) Vercel env ↔ runtime (Vite) — mismatch risk

- **How Vercel injects env:** During `vite build`, Vercel injects Environment Variables into the build process. `loadEnv(mode, process.cwd(), '')` (empty prefix) loads **all** env vars, including `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Is `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY` in runtime JS?** Yes. Vite `define` **replaces** the identifier at build time with the string value. The built JS does not read `process.env` at runtime; it contains the literal string. So runtime value = value at **build** time on Vercel.
- **Risk:**  
  - **Build-time OK, runtime undefined:** No. There is no runtime `process.env` read for these; they are baked in at build.  
  - **Real risk:** Vercel env var **value** is wrong (see above: wrong key, other project, old key, typo). Or env var was added/updated but **Redeploy** was not run, so the build still has the old value.

---

## 5) Minimal fix (one action)

**Root cause (one sentence):**  
`NEXT_PUBLIC_SUPABASE_ANON_KEY` on Vercel is set to a value that Supabase does not accept for this project (wrong key, other project, or old/regenerated anon key).

**Where the wrong key comes from:**  
Vercel project → Environment Variables → `NEXT_PUBLIC_SUPABASE_ANON_KEY`. That value is injected into the Vite build and used as the Supabase anon key in the browser.

**What key to use instead:**  
The **anon public** key for the **same** Supabase project as `NEXT_PUBLIC_SUPABASE_URL`:  
Supabase Dashboard → **Project Settings** → **API** → **Project API keys** → copy **anon** / **public** (not service_role, not JWT secret).

**Exact fix steps (max 3):**

1. In **Supabase**: open the project that matches your URL → **Settings** → **API** → under **Project API keys** copy the **anon public** key (full string).
2. In **Vercel**: Project → **Settings** → **Environment Variables** → set `NEXT_PUBLIC_SUPABASE_ANON_KEY` to that anon key (for Production, and optionally Preview/Development). Remove any old/duplicate keys (e.g. `VITE_SUPABASE_ANON_KEY` if still present).
3. In **Vercel**: **Deployments** → open the latest deployment → **Redeploy** (or push a new commit). Do **not** only “Restart”; a **new build** is required so the new key is baked into the bundle.

**Why this explains 401 + Unregistered API key:**  
Supabase Auth validates the `apikey` header against the project’s known keys. If the value is not the current anon key for that project (wrong key, other project, or revoked/regenerated), it returns 401 and `AuthApiError: Unregistered API key`. Replacing the env var with the correct anon key and redeploying fixes it; no code changes needed.

---

**Final note:** After this fix, login should work without any other code changes. Do not add new env vars or refactor WorkerContext/calendar/routing for this issue.
