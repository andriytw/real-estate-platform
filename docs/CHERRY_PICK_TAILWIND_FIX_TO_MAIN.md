# Improved plan: Cherry-pick Tailwind/PostCSS fix to main (no execution)

**Source commit:** `760994e25a6798c47a27c26a190cf7b934b3fb48`  
**Target:** `main`  
**Plan only. Do NOT execute any git commands, do NOT modify files, do NOT push.**

---

## A) Commit scope report

### Exact files changed by 760994e

| File | What the change does (short) |
|------|------------------------------|
| **package.json** | Removes `@tailwindcss/vite`; changes `tailwindcss` from `^4.1.17` to `^3.4.17`. |
| **package-lock.json** | Lockfile update for tailwind v3 and removal of @tailwindcss/vite. |
| **postcss.config.cjs** | **New file.** PostCSS config: `tailwindcss`, `autoprefixer` plugins. |
| **src/index.css** | Replaces Tailwind v4 directives with v3 (`@tailwind base;` `components;` `utilities;`). Updates base/scrollbar styles (font-family, background, scrollbar colors). |
| **tailwind.config.js** | Adds content paths (`./App.tsx`, `./contexts/**`); adds `theme.extend` (colors: primary, accent, accentGlow, bgDark, surfaceDark, textDark; fontFamily.sans). |
| **vite.config.ts** | Removes Tailwind Vite plugin import and usage; adds `base: '/'`. |

**Exact list:** `package-lock.json`, `package.json`, `postcss.config.cjs`, `src/index.css`, `tailwind.config.js`, `vite.config.ts`.

### Non-Tailwind / non-build changes

- **None.** Scope is limited to Tailwind/PostCSS/build pipeline only. No app logic, no other dependency changes.

### Not in the commit (required later)

- **index.html** is unchanged by 760994e. Main currently has Tailwind CDN in `index.html`; it must be removed in a **separate commit** after the cherry-pick so production uses only the built CSS.

---

## B) Risk assessment

- **Conflict risk:** **Medium**
- **Why:** A test cherry-pick onto current main produced conflicts in **package-lock.json**, **src/index.css**, and **tailwind.config.js**. `package.json`, `vite.config.ts`, and new `postcss.config.cjs` applied cleanly.
- **Lockfile/package manager:** After resolving conflicts, run `npm install` so the lockfile matches `package.json` and tailwind v3. Do not commit a hand-edited `package-lock.json` without re-running `npm install`.
- **Production deploy:** After push, ensure the deployed build is from the branch that includes both the cherry-pick and the index.html CDN-removal commit. Until index.html is updated, the app may still load the CDN script; remove it in the separate commit before relying on “built CSS only” in production.

---

## C) Improved direct-to-main execution plan (commands only, in order; NO execution)

```bash
# 1) Update refs and switch to main
git fetch origin
git checkout main
git pull origin main

# 2) Apply the fix commit
git cherry-pick 760994e25a6798c47a27c26a190cf7b934b3fb48
```

**If conflicts occur:** resolve as in section D below, then:

```bash
git add src/index.css tailwind.config.js package-lock.json
git cherry-pick --continue
```

**To abort instead:**

```bash
git cherry-pick --abort
```

**After cherry-pick completes (no amend):**

```bash
# 3) Remove Tailwind CDN from index.html (edit file: remove CDN script + inline tailwind.config block)
#    Then create a separate commit:
git add index.html
git commit -m "chore: remove Tailwind CDN from index.html (use PostCSS build only)"

# 4) If you resolved package-lock.json by taking theirs or editing, refresh lockfile:
npm install

# 5) Verify build
npm run build
npm run preview
# Manually check /market, /account, key dashboards; console should have no Tailwind CDN warning.

# 6) Pre-push safety checks (section E)
git status
git log --oneline -n 5

# 7) Push only after checks pass
git push origin main
```

---

## D) Conflict-resolution mini-guide

### src/index.css

- **From the cherry-picked commit, keep:** The three lines `@tailwind base;`, `@tailwind components;`, `@tailwind utilities;` at the top. Keep the commit’s base styles block (font-family, background-color, scrollbar styles) that follows.
- **From main, drop:** The comment `/* Custom styles - Tailwind is loaded via CDN in index.html */` and main’s body/scrollbar values where they conflict (commit’s values are the ones that match the v3 build).
- **Result:** File must start with the three `@tailwind` directives, then the base/scrollbar block from the commit. Keep any later sections from main that are not in conflict (e.g. animation utilities). Remove all `<<<<<<<`, `=======`, `>>>>>>>` markers.

### tailwind.config.js

- **Preserve from the commit:** Full `content` array including `"./App.tsx"` and `"./contexts/**/*.{js,ts,jsx,tsx}"`; full `theme.extend` with `colors` (primary, accent, accentGlow, bgDark, surfaceDark, textDark) and `fontFamily.sans`; `darkMode: "class"`; `plugins: []`.
- **Drop:** main’s empty `extend: {}` in favour of the commit’s `extend: { colors: {...}, fontFamily: {...} }`.
- **Result:** Single, conflict-free config with no markers. No empty `extend: {}`.

### package-lock.json

- **Safest strategy:** Do not resolve lockfile by hand. Option A: `git checkout --theirs package-lock.json`, then run `npm install` to regenerate from current `package.json`. Option B: `git checkout --ours package-lock.json`, then run `npm install` so tailwind v3 is installed and lockfile updated. Commit the result after `npm install`. Prefer Option B if main’s lockfile is more likely to match other main dependencies.

---

## E) Pre-push safety checks

Run before `git push origin main`:

```bash
git status
```

- **Confirm:** Working tree clean; no “Unmerged paths”; branch is `main`.

```bash
git log --oneline -n 5
```

- **Confirm:** Top commit is the new “chore: remove Tailwind CDN from index.html” (or your message). Below it, the cherry-picked “fix(tailwind): switch to v3 + PostCSS…”. No unintended extra commits.

**Checklist before push:**

- [ ] `git status` is clean, on `main`.
- [ ] `git log --oneline -n 5` shows the CDN-removal commit then the Tailwind fix commit.
- [ ] `npm run build` succeeded.
- [ ] Local smoke test (e.g. `npm run preview`) showed correct styles and no Tailwind CDN warning in console.

---

## F) Post-push / post-deploy validation checklist

### Routes and screens

- [ ] **/market** (or /) — Market/list: layout, cards, filters, typography.
- [ ] **/account** — Account dashboard: sidebar, property list, selected property panel (tabs, tables, buttons).
- [ ] **Key dashboards** — Sales calendar, Admin/Tasks (if used): grids, modals, buttons.

### Visual parity

- [ ] Dark theme intact: backgrounds, borders, text colors match previous look.
- [ ] Buttons, inputs, tables styled (no unstyled blocks).
- [ ] No broken layout (sidebar, content areas).

### Console

- [ ] **Tailwind CDN production warning is gone** (e.g. “Do not use the CDN in production” or similar). This confirms index.html no longer loads `cdn.tailwindcss.com`.
- [ ] No new errors related to Tailwind or CSS.

### Tailwind CDN no longer required

- [ ] `index.html` contains no `<script src="https://cdn.tailwindcss.com">`; styles come from built assets (e.g. `dist/assets/*.css`).
