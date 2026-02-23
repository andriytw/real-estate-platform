# Auth persistence — manual reproduction checklist

## Verification A: Single Supabase client ✅

- `rg "createBrowserClient|createClient\("` — **createBrowserClient:** 0 matches.
- **createClient(:** Only **one definition** in `utils/supabase/client.ts` (line 10).  
  WorkerContext, RegisterPage, supabaseService, AccountDashboard, TaskDetailModal, TestDB **import and call** that same `createClient()` → same singleton. No second client; no local client creation in components.

---

## Verification B: Login only when session === null ✅

**AuthGate.tsx:**
- `session === undefined` → "Reconnecting…" / "Checking session…"
- `session === null` → Login or Register (by path)
- session exists → `{children}` (app)

No timeouts. No "Login because worker is null".

---

## Verification C: Worker error ≠ logout ✅

**WorkerContext:**
- **loadWorkerWhenSessionExists** — on error: `setWorkerError(err)` only; no `setWorker(null)`, no `setSession(null)`.
- **refreshWorker** — on error: `setWorkerError(err)` only; no `setWorker(null)`.
- **syncSessionAndWorker** — when `s` exists and getCurrentWorker() fails: `setWorkerError(err)` only; no `setWorker(null)`.  
  `setSession(null)` / `setWorker(null)` only when `getSession()` returns null or throws.
- **Mount** — when session exists and getCurrentWorker() fails: `setWorkerError(err)` only.

Profile load failure → workerError + Retry only; no false logout.

---

## Manual tests

### Test A: Tab switch
1. Login once.
2. Switch to another tab for 10–30 s.
3. Return to app tab.  
**Expected:** Still logged in, no login screen flash.

### Test B: Refresh
1. Login once.
2. Refresh page (F5).  
**Expected:** Still logged in.

### Test C: New tab (same origin)
1. Login once.
2. Open app in a new tab (same URL).  
**Expected:** Still logged in.

### Test D: Close / reopen browser
1. Login once.
2. Close browser completely (all windows).
3. Open browser again and go to the app.  
**Expected:** Still logged in (session from localStorage).

### Test E: Two tabs — logout in one
1. Open app in tab 1, login.
2. Open app in tab 2 (same origin).
3. In tab 1: click Logout.  
**Expected:** Tab 2 also shows Login (onAuthStateChange / storage propagates sign-out).

---

## Commit order

```bash
git add .gitignore
git add App.tsx components/AuthGate.tsx components/RegisterPage.tsx contexts/WorkerContext.tsx utils/supabase/client.ts
git commit -m "fix(auth): persist session across tab switch (session-first gate)"
git push
```
