# Phase 4 — Legacy cleanup audit and staged cleanup plan

**Status:** Audit and planning only. No cleanup implementation, migrations, or behavior changes are part of this document.

**Audience:** Engineers maintaining access control, profiles, tasks/calendar, Kanban, and Supabase RLS.

---

## 1. Executive summary

### What was stabilized in Phases 1–3B

- **Phase 1:** Access-model columns on `profiles` (`department_scope`, `can_manage_users`, `can_be_task_assignee`) and backfill rules (see [supabase/migrations/20260329120000_profiles_access_model_columns.sql](supabase/migrations/20260329120000_profiles_access_model_columns.sql)).
- **Phase 2:** Frontend routing/module alignment via [lib/permissions.ts](lib/permissions.ts), [lib/uiAccess.ts](lib/uiAccess.ts), and dashboard integration.
- **Phase 3A:** Server-side permission helpers for the Vercel command API ([api/_lib/server-permissions.ts](api/_lib/server-permissions.ts), [api/_lib/command-auth.ts](api/_lib/command-auth.ts)).
- **Phase 3B Step 1:** DB helpers and RPC alignment — scope-first with **legacy fallback only when `department_scope` is null** ([supabase/migrations/20260330100000_phase3b_step1_helpers_rpc_scope_first.sql](supabase/migrations/20260330100000_phase3b_step1_helpers_rpc_scope_first.sql)).
- **Phase 3B Step 2:** `task_chat_messages` RLS + `profiles` UPDATE tightening ([supabase/migrations/20260331120000_phase3b_step2_task_chat_profiles_rls.sql](supabase/migrations/20260331120000_phase3b_step2_task_chat_profiles_rls.sql)).
- **AdminCalendar:** Canonical assignee id for the Facility task modal (`workerId || assignedWorkerId`) via [components/kanban/assigneeUtils.ts](components/kanban/assigneeUtils.ts) and [components/AdminCalendar.tsx](components/AdminCalendar.tsx).

### What legacy layers still remain

Multiple **parallel representations** are intentional for production safety:

| Area | Legacy / transitional | Canonical / new |
|------|------------------------|-------------------|
| Profile scope | `profiles.department`, `profiles.category_access` | `profiles.department_scope`, flags |
| User admin capability | `role === 'super_manager'` in some gates | `can_manage_users` (with super_manager backfill / bridge in transform) |
| Task assignee | `assignee` text, `assigned_worker_id`, `worker_id` | Pass 2 pool uses `can_be_task_assignee` + active; UI uses canonical id helper |
| Kanban | `localStorage` custom columns | DB `kanban_*` tables exist from older SQL |
| Chat | — | `task_chat_messages` (active); `task_comments` table exists in SQL history |

### Why cleanup must be staged, not big-bang

- **RLS and RPC helpers** embed transitional rules (`category_access` only when scope is unresolved). Removing columns or branches without data backfill and parallel verification would **deny access** or **widen grants incorrectly**.
- **Client `profiles.select('*')`** and **transform defaults** ([transformWorkerFromDB](services/supabaseService.ts)) assume certain columns and fallbacks; narrowing SELECT or removing `category_access` without updating all readers breaks the sidebar and invite flows.
- **Calendar events** still have dual UUID columns plus display `assignee`; unifying requires a single write path and migration strategy.

---

## 2. Inventory of transitional / legacy structures

Grouped by layer. Paths point to concrete code or schema history.

### Frontend

| Item | Where | Notes |
|------|--------|------|
| `effectiveDepartmentScope` + `categoryAccess` fallback | [lib/permissions.ts](lib/permissions.ts) | For `canViewModule`, unresolved scope uses `category_access` array (transitional). |
| `super_manager` / `department_scope === 'all'` full module access | [lib/permissions.ts](lib/permissions.ts) | Documented as full access; distinct from `canManageUsers`. |
| `canManageUsers` | [lib/permissions.ts](lib/permissions.ts), [components/admin/UserManagement.tsx](components/admin/UserManagement.tsx) | Gates admin UI; not the same as every `super_manager` check elsewhere. |
| Kanban column persistence | [components/kanban/KanbanBoard.tsx](components/kanban/KanbanBoard.tsx) | `localStorage` key `kanban_custom_columns`. |
| Assignee pool | [components/kanban/assigneeUtils.ts](components/kanban/assigneeUtils.ts) | `filterAssignableWorkers` → `isEligibleTaskAssignee` ([lib/permissions.ts](lib/permissions.ts)); no department filter. |
| `getCalendarEventAssigneeId` | [components/kanban/assigneeUtils.ts](components/kanban/assigneeUtils.ts) | `workerId \|\| assignedWorkerId \|\| ''`. |
| Department scope in Kanban filtering | [components/kanban/KanbanBoard.tsx](components/kanban/KanbanBoard.tsx) | Uses `effectiveDepartmentScope`. |

### Backend / API

| Item | Where | Notes |
|------|--------|------|
| Command profile load | [api/_lib/command-auth.ts](api/_lib/command-auth.ts) | Explicit `profiles` column list including `category_access`, `can_manage_users`, `can_be_task_assignee`. |
| Server permission LEGACY branches | [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts) | `department` and `category_access` for offers/invoices/confirm payment; `manager && scope == null` broad allow on invoices (comment: remove after backfill). |
| Edge function invites | [supabase/functions/invite-user/index.ts](supabase/functions/invite-user/index.ts) | Writes `department_scope`, mirrored `department`, `category_access` as applicable. |

### Database schema (representative; not exhaustive)

| Item | Where | Notes |
|------|--------|------|
| `profiles.department` | Mirroring rules | [lib/profileDepartmentSync.ts](lib/profileDepartmentSync.ts) documents sentinel behavior for `department_scope = all`. |
| `profiles.category_access` | JSONB array | Default/transform in [services/supabaseService.ts](services/supabaseService.ts) `transformWorkerFromDB` when not an array. |
| `profiles.department_scope`, `can_manage_users`, `can_be_task_assignee` | Migration | [20260329120000_profiles_access_model_columns.sql](supabase/migrations/20260329120000_profiles_access_model_columns.sql). |
| `calendar_events.worker_id`, `assigned_worker_id`, `assignee` | [services/supabaseService.ts](services/supabaseService.ts) | `transformCalendarEventFromDB` / `transformCalendarEventToDB` / `buildCalendarEventDbPatch`. |
| `calendar_events.column_id`, `created_from` | [supabase/migration_kanban_auth.sql](supabase/migration_kanban_auth.sql) | Added by Kanban migration; see §2 task/calendar for app usage. |
| `kanban_columns`, `kanban_column_workers` | [supabase/migration_kanban_auth.sql](supabase/migration_kanban_auth.sql) | No `from('kanban_columns')` in application `.ts`/`.tsx` (repo search). |
| `task_chat_messages` | App | Primary task chat storage ([services/supabaseService.ts](services/supabaseService.ts), [components/AdminCalendar.tsx](components/AdminCalendar.tsx)). |
| `task_comments` | [supabase/migration_kanban_final.sql](supabase/migration_kanban_final.sql) | No references in `.ts`/`.tsx` in this repo (search). |

### RLS / policies

| Item | Where | Notes |
|------|--------|------|
| Scope-first helpers | [20260330100000_phase3b_step1_helpers_rpc_scope_first.sql](supabase/migrations/20260330100000_phase3b_step1_helpers_rpc_scope_first.sql) | `effective_department_scope()`, `has_full_scope_db()`, `has_sales_category_access()` (only if `department_scope` null), `is_sales_user()`, `is_accounting_user()`, etc. |
| Task chat RLS | [20260331120000_phase3b_step2_task_chat_profiles_rls.sql](supabase/migrations/20260331120000_phase3b_step2_task_chat_profiles_rls.sql) | Scope-first; references Pass 2 module concept via policies. |
| Older / duplicate policy scripts | [supabase/fix_rls_performance.sql](supabase/fix_rls_performance.sql), root `migration_*.sql` | May overlap with timestamped migrations; hygiene risk (§6). |

### Task / calendar system

| Item | Where | Notes |
|------|--------|------|
| Dual assignee UUIDs + text | [services/supabaseService.ts](services/supabaseService.ts) | Create path sets both `worker_id` and `assigned_worker_id` from `(workerId \|\| assignedWorkerId)`; patch can set fields independently if present in partial. |
| Kanban task create | [components/KanbanTaskModal.tsx](components/KanbanTaskModal.tsx) | Passes `columnId` and `createdFrom: 'kanban'` on the object passed to `calendarEventsService.create`. |
| `transformCalendarEventToDB` | [services/supabaseService.ts](services/supabaseService.ts) | Does **not** include `column_id` / `created_from` mapping; [types.ts](types.ts) `CalendarEvent` does not list `columnId` / `createdFrom`. **Drift:** UI may pass keys that are not persisted to DB by the transformer. |
| `tasksService.getAll` worker filter | [services/supabaseService.ts](services/supabaseService.ts) | Uses `worker_id` in OR filter for worker role (facility task loading). |

### 2.1 Key legacy items (detailed analysis)

Each block uses: **Item** | **Where found** | **Why it still exists** | **Current risk** | **Cleanup recommendation** | **Preconditions before removal or major change**

---

**Item:** `profiles.select('*')` in WorkerContext (session profile)

- **Where found:** [contexts/WorkerContext.tsx](contexts/WorkerContext.tsx) — `.from('profiles').select('*')` after auth (and again after insert recovery path).
- **Why it still exists:** Historical simplicity; any new `profiles` column is automatically available to `transformWorkerFromDB` without updating the select list.
- **Current risk:** Tight coupling to the full row shape. Narrowing columns later without auditing every `Worker` consumer will cause missing fields or wrong defaults (especially `category_access` defaults in [transformWorkerFromDB](services/supabaseService.ts)).
- **Cleanup recommendation:** Replace with an explicit column list aligned with [api/_lib/command-auth.ts](api/_lib/command-auth.ts) (and any extra columns UserManagement / invite flows require), or introduce a shared constant for “session profile columns.”
- **Preconditions:** Inventory of all fields read from `worker` in the app; staging tests for login, sidebar, and admin screens; `transformWorkerFromDB` defaults reviewed for omitted columns.

---

**Item:** Admin profile list reads — explicit columns first, full fallback transitional

- **Where found:** [services/supabaseService.ts](services/supabaseService.ts) — `getAdminProfilesList` uses explicit [ADMIN_PROFILE_SELECT_COLUMNS](lib/sessionProfileSelect.ts) and is used by [usersService.getAll](services/supabaseService.ts) for User Management list.
- **Phase 4F:** Operational lists stay on `getWorkerDirectory()` / `getAssignableWorkers()` (explicit [SESSION_PROFILE_SELECT_COLUMNS](lib/sessionProfileSelect.ts)); admin list/by-id flows now use explicit admin column methods.
- **Why full row:** Admin user editing and invite flows need the full profile shape in one call for UserManagement.
- **Current risk:** Same as broad SELECT for this admin list path. Payload size.
- **Cleanup recommendation:** Remove transitional full fallback methods after final usage audit confirms no active callers.
- **Preconditions:** Inventory admin form fields; verify assignee filtering still matches [filterAssignableWorkers](components/kanban/assigneeUtils.ts) after any column change.

---

**Item:** `transformWorkerFromDB` — `categoryAccess` default array and `canManageUsers` super_manager bridge

- **Where found:** [services/supabaseService.ts](services/supabaseService.ts) — `categoryAccess` defaults to a full module list when DB value is not an array; `canManageUsers` is true if `can_manage_users === true` **or** `(can_manage_users == null && role === 'super_manager')`.
- **Why it still exists:** Backward compatibility for rows created before Pass 1 flags were consistently set; avoids locking super admins out of User Management if `can_manage_users` was never written.
- **Current risk:** Client-side inference can **diverge** from DB truth; `canManageUsers` in [lib/permissions.ts](lib/permissions.ts) is **only** `!!user?.canManageUsers` (no role check) — the bridge is entirely in the transform. Removing the bridge before backfilling DB breaks admin access for some rows.
- **Cleanup recommendation:** Backfill `can_manage_users` for all `super_manager` rows in DB; then remove the null-coalescing bridge; optionally tighten `categoryAccess` default when `department_scope` is fully populated.
- **Preconditions:** One-time SQL backfill verified; UserManagement smoke test; `can_manage_users` visible in admin UI for all super managers.

---

**Item:** `category_access` + unresolved `department_scope` — sidebar and server LEGACY branches

- **Where found:** [lib/permissions.ts](lib/permissions.ts) `canViewModule` (lines 75–87) when `effectiveDepartmentScope` is null; [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts) (LEGACY `category_access` via `categoryAccessIncludesNormalizedToken`, `department === 'sales'`, etc.); DB [has_sales_category_access()](supabase/migrations/20260330100000_phase3b_step1_helpers_rpc_scope_first.sql) when `department_scope IS NULL`.
- **Why it still exists:** Users with legacy `department` (e.g. `general`) or missing scope still need Sales/Accounting UI and RPC behavior until scopes are set.
- **Current risk:** Removing `category_access` or LEGACY OR branches without backfill **denies** module tiles or command API access for edge profiles.
- **Cleanup recommendation:** Phase **4D**: metrics on `department_scope IS NULL` for active users; backfill scopes; then delete LEGACY branches in a coordinated client + server + DB release.
- **Preconditions:** Near-zero active users with unresolved scope except documented exceptions; parity tests for confirm payment / invoice / offers command paths.

---

**Item:** `super_manager` vs `can_manage_users` — two concepts

- **Where found:** Full module access: [lib/permissions.ts](lib/permissions.ts) (`super_manager` OR `hasFullScopeAccess`). Admin module: `canManageUsers` only. Kanban UI: [components/kanban/KanbanBoard.tsx](components/kanban/KanbanBoard.tsx) uses `role === 'super_manager'` for column delete/create affordances. User management gate: [components/admin/UserManagement.tsx](components/admin/UserManagement.tsx) uses `canManageUsers(currentUser)`.
- **Why it still exists:** Product choice: “full app access” is not identical to “user administration”; Pass 1 added `can_manage_users` as the long-term flag; `super_manager` remains a role with broad visibility.
- **Current risk:** Confusion and duplicate checks; changing Kanban to `canManageUsers` only would **hide** features for some roles unless product agrees.
- **Cleanup recommendation:** Document a single matrix (role × scope × flags); optionally align Kanban super-only actions with `canManageUsers` **only after** product confirms.
- **Preconditions:** Product sign-off; QA on Kanban for non–super-manager admins if any exist with `can_manage_users`.

---

**Item:** Calendar assignee — `worker_id`, `assigned_worker_id`, `assignee` text

- **Where found:** [services/supabaseService.ts](services/supabaseService.ts) — `transformCalendarEventFromDB`, `transformCalendarEventToDB` (sets both UUID columns from `workerId || assignedWorkerId`), `buildCalendarEventDbPatch` (independent keys); [components/AccountDashboard.tsx](components/AccountDashboard.tsx) `handleAdminEventUpdate` passes `workerId`, `assignedWorkerId`, `assignee`; [components/kanban/assigneeUtils.ts](components/kanban/assigneeUtils.ts) `getCalendarEventAssigneeId` for UI canonical id.
- **Why it still exists:** DB history (separate columns); display name cache in `assignee` text; partial updates may send only one key.
- **Current risk:** Rows where UUID columns diverge; patches that null one field; CSV/list code paths that still assume a single field in some places.
- **Cleanup recommendation:** Phase **4C**: one write contract (always set both UUIDs together); optional DB constraint after backfill; deprecate redundant `assignee` text if names always resolved via join.
- **Preconditions:** Data audit query for `worker_id <> assigned_worker_id`; full regression on Facility calendar, Kanban, and `tasksService.update` paths.

---

**Item:** Kanban — `localStorage` vs DB `kanban_columns` / `calendar_events.column_id` / `created_from`

- **Where found:** [components/kanban/KanbanBoard.tsx](components/kanban/KanbanBoard.tsx) — `kanban_custom_columns` in `localStorage`. Schema: [supabase/migration_kanban_auth.sql](supabase/migration_kanban_auth.sql). [components/KanbanTaskModal.tsx](components/KanbanTaskModal.tsx) passes `columnId` and `createdFrom: 'kanban'` into task create. [services/supabaseService.ts](services/supabaseService.ts) `transformCalendarEventToDB` does **not** map these to `column_id` / `created_from` (and [types.ts](types.ts) `CalendarEvent` does not declare these fields).
- **Why it still exists:** Kanban board evolved client-side; DB columns may have been intended for future sync or reporting.
- **Current risk:** Operators inspecting `calendar_events` may see NULL `column_id` / `created_from` despite UI passing metadata — **schema–app drift**.
- **Cleanup recommendation:** Either wire fields through types + `transformCalendarEventToDB` + patch builder, or document DB columns as unused and stop assuming they are populated.
- **Preconditions:** Product decision on source of truth (browser-only columns vs DB); migration if switching to DB-backed columns.

---

**Item:** `task_chat_messages` vs `task_comments`

- **Where found:** App reads/writes `task_chat_messages` ([services/supabaseService.ts](services/supabaseService.ts), [components/AdminCalendar.tsx](components/AdminCalendar.tsx)). `task_comments` created in [supabase/migration_kanban_final.sql](supabase/migration_kanban_final.sql); **no** `.ts`/`.tsx` references in repo search.
- **Why it still exists:** Likely superseded by `task_chat_messages` for calendar-linked chat.
- **Current risk:** Orphan table consuming maintenance/RLS surface; dropping without validation could break unknown scripts.
- **Cleanup recommendation:** Validate in production DB (row counts, foreign keys); archive or drop only after DBA sign-off.
- **Preconditions:** Confirmed zero application or ETL use; backup.

---

**Item:** SQL / migration hygiene — `has_sales_category_access` and root-level scripts

- **Where found:** Function `has_sales_category_access` appears in multiple timestamped migrations (e.g. [20260314100000_confirm_payment_align_with_ui_access.sql](supabase/migrations/20260314100000_confirm_payment_align_with_ui_access.sql), [20260330100000_phase3b_step1_helpers_rpc_scope_first.sql](supabase/migrations/20260330100000_phase3b_step1_helpers_rpc_scope_first.sql), [20260315100000_fix_booking_company_id_in_rpc.sql](supabase/migrations/20260315100000_fix_booking_company_id_in_rpc.sql), [20260328180000_mark_invoice_paid_allow_service_role.sql](supabase/migrations/20260328180000_mark_invoice_paid_allow_service_role.sql)). Non-timestamped scripts under [supabase/](supabase/) (e.g. `migration_*.sql`, `fix_*.sql`) coexist with [supabase/migrations/](supabase/migrations/).
- **Why it still exists:** Incremental fixes; historical manual applies before strict migration ordering.
- **Current risk:** Engineers may re-apply an older script and **overwrite** a newer function definition; drift between environments.
- **Cleanup recommendation:** Treat [supabase/migrations/](supabase/migrations/) as the canonical applied history; add a short `supabase/README.md` (or a section in this doc) listing root `supabase/*.sql` scripts as **manual / archival only**; avoid duplicate `CREATE OR REPLACE` of the same helper without a single source file in repo.
- **Preconditions:** Team agreement; optional `supabase db diff` against prod to verify live definitions match latest migration.

---

## 3. Still actively used vs likely removable

Legend: **A** = actively used, **T** = transitional but necessary, **L** = likely removable later (with preconditions), **U** = unclear / needs validation (DB + prod checks).

| Item | Classification | Evidence |
|------|----------------|----------|
| `profiles.department_scope` | A | Primary scope in [lib/permissions.ts](lib/permissions.ts), [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts), DB helpers. |
| `profiles.department` (mirrored) | T | RLS and legacy reads; [lib/profileDepartmentSync.ts](lib/profileDepartmentSync.ts). |
| `profiles.category_access` | T | Sidebar fallback [lib/permissions.ts](lib/permissions.ts); server LEGACY branches [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts); DB `has_sales_category_access` when scope null. |
| `can_manage_users` | A | [lib/permissions.ts](lib/permissions.ts); command auth; UserManagement. |
| `transformWorkerFromDB` super_manager bridge for `canManageUsers` | T | [services/supabaseService.ts](services/supabaseService.ts) — true if DB null and role super_manager. |
| `WorkerContext` explicit session columns | A | [contexts/WorkerContext.tsx](contexts/WorkerContext.tsx) via [SESSION_PROFILE_SELECT_COLUMNS](lib/sessionProfileSelect.ts). |
| `workersService.getAdminProfilesList` explicit columns | A | [services/supabaseService.ts](services/supabaseService.ts); UserManagement via `usersService.getAll`. |
| `workersService.getAllProfilesFull` / `getProfileByIdFull` `select('*')` | L (removed) | Removed in 4H; see [Phase 4H](docs/phase-4-legacy-cleanup-audit.md). |
| `workersService.getWorkerDirectory` / `getAssignableWorkers` explicit columns | A | Operational lists: calendar, kanban, tasks (`getAssignableWorkers`); warehouse worker list (`getWorkerDirectory` only — same implementation). |
| `worker_id` + `assigned_worker_id` + `assignee` | A | Transforms and [AccountDashboard](components/AccountDashboard.tsx) patch patterns. |
| `getCalendarEventAssigneeId` | A | Assignee UI alignment post–Phase 3 fix. |
| Kanban `localStorage` columns | A | [components/kanban/KanbanBoard.tsx](components/kanban/KanbanBoard.tsx). |
| DB `kanban_columns` / workers | U | Schema exists; no app client query found — validate if any edge function or SQL job uses them. |
| `task_chat_messages` | A | Core Facility chat. |
| `task_comments` | U / L? | Table in SQL; **no** TS usage — validate empty in prod before any drop. |
| Root `supabase/migration_*.sql` vs `migrations/` | T | Historical/manual; risk of confusion, not automatically “removable.” |

---

## 4. Highest-risk cleanup targets

1. **Narrowing `profiles` SELECT in the browser** ([contexts/WorkerContext.tsx](contexts/WorkerContext.tsx), [workersService.getWorkerDirectory](services/supabaseService.ts) / [getAssignableWorkers](services/supabaseService.ts), [workersService.getAdminProfilesList](services/supabaseService.ts)) without updating [transformWorkerFromDB](services/supabaseService.ts) and every consumer — **breaks** defaults for `categoryAccess`, invite flows, and admin UIs.

2. **Removing `category_access` from DB or server helpers** before all users have resolvable `department_scope` — **breaks** sales/accounting access for edge profiles currently relying on LEGACY branches ([api/_lib/server-permissions.ts](api/_lib/server-permissions.ts), [20260330100000_phase3b_step1_helpers_rpc_scope_first.sql](supabase/migrations/20260330100000_phase3b_step1_helpers_rpc_scope_first.sql)).

3. **Assignee field unification** (`worker_id` only, drop `assigned_worker_id` or `assignee` text) — requires **migration**, backfill, and verification of every insert/update path ([buildCalendarEventDbPatch](services/supabaseService.ts), [transformCalendarEventToDB](services/supabaseService.ts), [handleAdminEventUpdate](components/AccountDashboard.tsx)).

4. **Removing `super_manager` shortcuts** in UI (e.g. Kanban [KanbanBoard.tsx](components/kanban/KanbanBoard.tsx)) without product decision — **behavior change** for full-access users.

5. **RLS / helper fallback removal** (`has_sales_category_access`, `is_sales_user` inner legacy OR) — must match **Phase 3B** rules; wrong ordering restores mis-grants described in migration comments.

6. **Kanban DB alignment** — Either wire `column_id` / `created_from` through [transformCalendarEventToDB](services/supabaseService.ts) and [types](types.ts) or explicitly deprecate DB columns; intermediate state confuses operators reading raw DB.

---

## 5. Safe future cleanup candidates (evidence only)

| Candidate | Why “safe” is conditional | Evidence |
|-----------|---------------------------|----------|
| Document which SQL files are **non-canonical** | Low risk | Many parallel files under [supabase/](supabase/) vs ordered [supabase/migrations/](supabase/migrations/). |
| **Dead app code paths** for Kanban DB | Only after validation | No `kanban_columns` client query in `.ts`/`.tsx`. |
| **`task_comments` table** | Only after prod validation | No TS references; confirm no external tool uses it. |
| **Duplicate helper definitions** in root SQL | Consolidation docs / deprecation headers | e.g. `has_sales_category_access` appears in multiple migration files — align on **latest** migration actually applied. |

Do **not** treat these as delete-ready without DBA / prod checks.

---

## Phase 4E — Legacy `category_access` / `department` fallback (inventory, controlled pass)

**Scope of this subsection:** access fallback reduction only (classification + safe internal deduplication). **Not** destructive removal. **Note:** the staged sequence table in §6 labels a different “4E” (Kanban storage); that remains a separate track.

### Inventory (code evidence)

| Location | Symbol / usage | Role |
|----------|----------------|------|
| [lib/permissions.ts](lib/permissions.ts) | `effectiveDepartmentScope` | Canonical first: valid `department_scope`; else map legacy `department` ∈ {facility, accounting, sales}; else `null`. |
| [lib/permissions.ts](lib/permissions.ts) | `canViewModule` | If scope non-null → scope-only module rules. If scope **null** → **legacy `categoryAccess` array** maps modules (sidebar). |
| [lib/permissions.ts](lib/permissions.ts) | `canAccessDepartment` | Scope-only; **no** `category_access` fallback — returns false when scope unresolved. |
| [lib/uiAccess.ts](lib/uiAccess.ts) | `firstAllowedDashboardModule`, `canAccessDashboardModule` | Thin wrappers over `canViewModule`. |
| [api/_lib/command-auth.ts](api/_lib/command-auth.ts) | `requireCommandProfile` select list | Loads `department`, `department_scope`, `category_access`, capability flags for command API. |
| [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts) | `canCreateOffersServer`, `canSaveInvoiceServer`, `canConfirmPaymentServer` | Primary: `effectiveDepartmentScope` + full scope; **LEGACY** `department` column; **LEGACY** `category_access` via normalized token match (`String(x).toLowerCase()`); `canSaveInvoiceServer` retains **`manager && scope == null`** broad allow. |
| [lib/sessionProfileSelect.ts](lib/sessionProfileSelect.ts) | `SESSION_PROFILE_SELECT_COLUMNS` | Session worker load includes `category_access` while client fallback exists. |
| [services/supabaseService.ts](services/supabaseService.ts) | `transformWorkerFromDB` | Maps `category_access` → `categoryAccess`. |
| [types.ts](types.ts) | `Worker.categoryAccess` | Typed transitional field. |
| [supabase/functions/invite-user/index.ts](supabase/functions/invite-user/index.ts) | invite payload | May write `category_access` — operational, not UI fallback. |
| [components/kanban/KanbanBoard.tsx](components/kanban/KanbanBoard.tsx) | `filterTasksForUserScope` | When `effectiveDepartmentScope` is **null**, returns tasks **unfiltered** (observe vs sidebar). |

### Classification (A / B / C)

**A — keep for now (backward compatibility / production-sensitive)**

- All **LEGACY** `department` and `category_access` branches in [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts), including **`profile.role === 'manager' && effectiveDepartmentScope(profile) == null`** on `canSaveInvoiceServer`.
- `canViewModule` **category_access** branch when `effectiveDepartmentScope` is null.
- `effectiveDepartmentScope` mapping from legacy `department` (RLS / row-shape compatibility).

**B — safe in this pass (no intended behavior change)**

- Internal deduplication of duplicate `category_access` array checks in [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts) into one helper with **identical** null/empty/array and token-matching semantics.

**C — remove later (prerequisites)**

- Dropping **category_access** from sidebar or server gates only after: active-user metrics for `department_scope IS NULL`, parity tests on command paths (offers / invoices / confirm payment), and policy on rows where `department_scope` disagrees with `department`.
- Aligning Kanban `scope == null` filtering with sidebar — product decision + tests.

### What Phase 4E explicitly did **not** do

- No DB column drops, no RLS edits, no removal of legacy branches, no widening or narrowing of gates beyond refactor-preserving semantics.

---

## 6. Historical cleanup sequence snapshot (superseded)

This section captures an earlier planning snapshot and is kept for audit history only.
Current sequencing guidance is defined by completed phases 4F-4I and newer Track B prep sections.

| Stage | Focus | Purpose |
|-------|--------|---------|
| **4A** | Audit lock-in + observability | Baseline metrics/logging for profile scope resolution rates, unresolved `department_scope`, assignee field parity (`worker_id` vs `assigned_worker_id`). No schema change. |
| **4B** | Profiles **read model** decoupling | Introduce explicit typed selects or a small profile DTO for **session** and **assignee list** separately; reduce `select('*')` coupling in [WorkerContext](contexts/WorkerContext.tsx) behind a reviewed column list (mirror [command-auth](api/_lib/command-auth.ts) pattern). |
| **4C** | Assignment field **contract** | Single documented rule for create/update: always set both UUID columns consistently; optionally add DB constraint or trigger **after** backfill — requires migration phase of its own. |
| **4D** | `category_access` / unresolved-scope reduction | Backfill `department_scope` for remaining rows; then remove LEGACY branches in [server-permissions.ts](api/_lib/server-permissions.ts) and DB helpers **only when** monitoring shows zero reliance. |
| **4E** | Kanban storage strategy | Choose: (i) persist columns to DB and migrate off `localStorage`, or (ii) document DB tables as unused and stop creating new confusion — may include optional column mapping for `column_id`/`created_from`. |
| **4F** | SQL repo hygiene | Index timestamped migrations; mark root scripts as archived or one-off with README. |

Sequence is **not** arbitrary: **4B** reduces blast radius before **4D**; **4C** before aggressive column drops on `calendar_events`.

---

## 7. Preconditions before each cleanup stage

| Stage | Must already be true | Verify first | If done too early |
|-------|----------------------|--------------|---------------------|
| **4A** | Deploy pipeline can ship observability-only changes | Staging env reflects prod RLS | N/A |
| **4B** | List of every `profiles` field each feature needs | Grep + manual pass on UserManagement, WorkerContext, assignee dropdowns | Missing columns → runtime errors / wrong defaults |
| **4C** | Agreement on single source of assignee UUID in API | Compare DB rows where `worker_id` ≠ `assigned_worker_id` | Partial updates null one column |
| **4D** | Backfill + dashboard showing no `department_scope` null for active managers (except approved exceptions) | Sample queries on prod replica | Loss of Sales/Accounting access |
| **4E** | Product decision on Kanban source of truth | User acceptance | Data loss if migrating localStorage incorrectly |
| **4F** | Backup and applied migration history | `supabase migration list` or equivalent | Re-applying wrong script |

---

## 8. Explicit “do not touch yet” list

- **Do not** drop `profiles.category_access` or stop writing it in invites until **4D** preconditions are met.
- **Do not** remove `profiles.department` mirroring while RLS policies or helpers still reference `user_department()`-style semantics without a full policy audit.
- **Do not** remove **`super_manager`** full-scope behavior from [lib/permissions.ts](lib/permissions.ts) without explicit product sign-off (affects entire app surface).
- **Do not** rewrite **Phase 3B** SQL helpers without a migration that preserves **scope-first, category only when scope null** semantics unless replacement is proven equivalent.
- **Do not** drop **`task_comments`** or **`kanban_*`** tables without production confirmation and backups.
- **Do not** narrow **`profiles` SELECT** in [WorkerContext](contexts/WorkerContext.tsx) without updating [transformWorkerFromDB](services/supabaseService.ts) fallbacks and testing **all** dashboard modules.

---

## 9. Suggested manual validation checklist (future cleanup phases)

After any change to access model, profiles loading, assignee, or task chat:

1. **Login** as `super_manager`, `manager` (facility-scoped), `worker` — session loads, sidebar modules match expectation.
2. **Facility calendar** — open task modal, change assignee, reload; CSV/list assignee names consistent ([AdminCalendar](components/AdminCalendar.tsx)).
3. **Kanban** — create task from column; verify task appears and, if **4E** is in scope, DB columns match product intent.
4. **Accounting / Sales** — flows that hit command API (invoices, offers, confirm payment) still authorized ([api/_lib/server-permissions.ts](api/_lib/server-permissions.ts)).
5. **User management** — edit scope and flags; invite user ([UserManagement](components/admin/UserManagement.tsx), edge [invite-user](supabase/functions/invite-user/index.ts)).
6. **Task chat** — send/read messages on a facility task ([task_chat_messages](supabase/migrations/20260331120000_phase3b_step2_task_chat_profiles_rls.sql) policies).

---

## 10. Historical recommendation snapshot

This recommendation is preserved as historical context from an earlier audit checkpoint.
It is superseded by later completed phases and by the Track ordering documented in Phase 4I and Phase 4J prep.

Secondary priority: **document or fix Kanban vs DB drift** (`columnId` / `createdFrom` vs [transformCalendarEventToDB](services/supabaseService.ts)) so operators and engineers do not assume DB `column_id` / `created_from` are populated by the current client path.

---

*Document generated as Phase 4 planning deliverable. Update this file when cleanup milestones complete.*

---

## Phase 4F — Profiles read-path separation (admin vs operational)

### Read-model boundaries

- **Session profile**: [contexts/WorkerContext.tsx](contexts/WorkerContext.tsx) uses [SESSION_PROFILE_SELECT_COLUMNS](lib/sessionProfileSelect.ts) only.
- **Operational profile list/read**: [workersService.getWorkerDirectory](services/supabaseService.ts), [workersService.getAssignableWorkers](services/supabaseService.ts), and [workersService.getWorkerByIdOperational](services/supabaseService.ts) use explicit session-aligned columns.
- **Admin profile read (explicit)**: [workersService.getAdminProfilesList](services/supabaseService.ts) and [workersService.getAdminProfileById](services/supabaseService.ts) use explicit [ADMIN_PROFILE_SELECT_COLUMNS](lib/sessionProfileSelect.ts), derived from actual UserManagement list/edit/create/invite/refetch usage plus [transformWorkerFromDB](services/supabaseService.ts) compatibility.

### Low-risk migration done in 4F

- [components/kanban/TaskDetailModal.tsx](components/kanban/TaskDetailModal.tsx) assignee profile load migrated from broad by-id read to [workersService.getWorkerByIdOperational](services/supabaseService.ts).
- User creation/refetch in [usersService](services/supabaseService.ts) now calls explicit admin by-id method [workersService.getAdminProfileById](services/supabaseService.ts).

### Transitional full reads status

- UserManagement list and admin edit/invite flows now use explicit admin-column methods via [usersService.getAll](services/supabaseService.ts) -> [workersService.getAdminProfilesList](services/supabaseService.ts).
- Transitional full methods were retained in 4F only as temporary fallback, then removed in 4H after 4G confirmed zero blocking runtime usage.

---

## Phase 4G — Final usage audit before 4H deletion

### Search matrix (mandatory evidence)

Buckets:
- `definition only`
- `runtime caller`
- `wrapper-only path`
- `docs/reference-only`

| Method symbol | File path | Line | Enclosing symbol | Bucket | Notes |
|---|---|---:|---|---|---|
| `getAllProfilesFull(` | [services/supabaseService.ts](services/supabaseService.ts) | 111 | `workersService.getAllProfilesFull` | definition only | Method definition. |
| `getAllProfilesFull(` | — | — | — | docs/reference-only | No external docs/runtime callers found in the 4G scan besides this audit file itself. |
| `getProfileByIdFull(` | [services/supabaseService.ts](services/supabaseService.ts) | 181 | `workersService.getProfileByIdFull` | definition only | Method definition. |
| `getProfileByIdFull(` | [services/supabaseService.ts](services/supabaseService.ts) | 220 | `workersService.getById` | wrapper-only path | Deprecated wrapper delegates to full method. |
| `workersService.getById(` | — | — | — | runtime caller | **0 hits** (explicit `workersService.getById(` search). |
| `.getById(` | [services/virtualDocumentsService.ts](services/virtualDocumentsService.ts) | 236 | booking path | docs/reference-only | Non-worker services (`bookingsService.getById` etc.), not target methods. |
| `.getById(` | [components/kanban/TaskDetailModal.tsx](components/kanban/TaskDetailModal.tsx) | 288 | property load | docs/reference-only | `propertiesService.getById`, not `workersService`. |
| `\"getById\"` / `'getById'` | — | — | — | runtime caller | **0 hits** for dynamic string-based access. |

Expanded `getById` coverage was run with:
- `search(workersService\\.getById\\()`
- `search(\\.getById\\()`
- `search(['\"]getById['\"])`
- import/re-export scan for hidden non-direct usage of `workersService` methods.

### Per-method caller status and classification

#### `workersService.getAllProfilesFull()`
- Runtime callers found: **0**
- Status: `dead / obsolete` (method currently unused at runtime)
- Blocks 4H deletion directly: **no**

#### `workersService.getProfileByIdFull()`
- Runtime callers found: **0 external**
- Wrapper-only usage: called only by deprecated `workersService.getById()` in [services/supabaseService.ts](services/supabaseService.ts).
- Status: `wrapper-only path`
- Blocks 4H deletion directly: **no** (if wrapper removed together)

#### `workersService.getById()` (deprecated)
- External runtime callers found: **0**
- Status: `dead / obsolete / wrapper-only`
- Blocks 4H deletion directly: **no**

### Fallback-prerequisite audit (separate from caller status)

| Blocker area | File | blocks 4H deletion now | blocks only broader later cleanup | Reason |
|---|---|---|---|---|
| Sidebar unresolved-scope fallback (`category_access`) | [lib/permissions.ts](lib/permissions.ts) | no | yes | Affects legacy module visibility behavior, not transitional full-method usage. |
| Server LEGACY access branches (`department`, `category_access`, `manager && scope == null`) | [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts) | no | yes | Governs command authorization; independent from transitional method caller map. |
| Command auth profile shape includes legacy fields | [api/_lib/command-auth.ts](api/_lib/command-auth.ts) | no | yes | Needed for server permission checks; separate cleanup track. |
| `transformWorkerFromDB` compatibility bridges/defaults | [services/supabaseService.ts](services/supabaseService.ts) | no | yes | Influences broader profile model cleanup; does not require keeping transitional full methods. |
| `department_scope` -> `department` mirror bridge | [lib/profileDepartmentSync.ts](lib/profileDepartmentSync.ts) | no | yes | RLS/backward-compatibility bridge for later legacy cleanup phases. |

No blocker above requires retaining `getAllProfilesFull/getProfileByIdFull/getById` themselves.

### Recommended 4H execution order

1. Remove deprecated `workersService.getById()` wrapper.
2. Remove `workersService.getProfileByIdFull()` (wrapper leaf).
3. Remove `workersService.getAllProfilesFull()` if still zero callers.
4. Re-run caller matrix + build in the same PR as guardrail.

### Final 4H readiness summary (mandatory)

- `getAllProfilesFull()`: caller status = `0 runtime callers`; deletion readiness = **ready**.
- `getProfileByIdFull()`: caller status = `wrapper-only`; deletion readiness = **ready with wrapper removal**.
- `getById()`: caller status = `0 external callers`; deletion readiness = **ready**.
- **Final verdict:** `4H can remove transitional full methods now: yes`.
- Legacy fallback fields (`department`, `category_access`) remain loaded where required by current compatibility logic (see Phase 4E section).

---

## Phase 4H — Safe removal of transitional full-profile methods

### Completed removals

From [workersService](services/supabaseService.ts), 4H removed:
- `getAllProfilesFull()`
- `getProfileByIdFull()`
- deprecated `getById()`

Related transitional-only JSDoc/comments tied to those methods were removed as part of the same patch.

### Why removal was safe

- 4G caller audit confirmed:
  - `getAllProfilesFull()` had zero runtime callers.
  - `workersService.getById()` had zero external callers.
  - `getProfileByIdFull()` was wrapper-only through deprecated `getById()`.
- 4H rechecked method symbols before deletion and found no unexpected live runtime caller.

### Broader legacy blockers intentionally left untouched (out of scope for 4H)

- `category_access` fallback behavior.
- `department` fallback and mirror bridge behavior.
- server-permissions legacy branches.
- command-auth legacy profile shape.
- `transformWorkerFromDB` compatibility cleanup.

These remain for later phases and were not changed in 4H.

### Post-removal caller summary

- `getAllProfilesFull()`: `0` remaining definitions/usages.
- `getProfileByIdFull()`: `0` remaining definitions/usages.
- `workersService.getById()` transitional method: `0` remaining definitions/usages.

---

## Phase 4I — Legacy compatibility dependency audit (permissions/auth/profile bridges)

4I is **audit-only**. No behavior/schema/RLS/access changes were made in this phase.

### Exact dependency map by area

Columns:
- runtime role: `client UI` / `server auth` / `server permission` / `profile transform` / `sync bridge` / `unknown`
- classification: `active runtime dependency` / `compatibility fallback` / `bridge logic` / `dead / obsolete` / `unclear / manual review needed`

| Area | File path | Line | Enclosing symbol | Runtime role | Fields relied on | Classification | blocks next cleanup directly | source of truth expected after cleanup | Notes |
|---|---|---:|---|---|---|---|---|---|---|
| category_access fallback | [lib/permissions.ts](lib/permissions.ts) | 49 | `canViewModule` | client UI | `role`, `isActive`, `departmentScope`, `department`, `categoryAccess` | compatibility fallback | yes | scope-based permission model (`department_scope` + normalized module checks) | Unresolved scope path (`scope == null`) uses `categoryAccess`. |
| category_access server fallback | [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts) | 48 | `categoryAccessIncludesNormalizedToken` | server permission | `category_access` | compatibility fallback | yes | scope-based command permission contract | Transitional token checks still used by command gates. |
| offers permission legacy | [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts) | 60 | `canCreateOffersServer` | server permission | `role`, `department_scope`, `department`, `category_access` | active runtime dependency | yes | scope-only server authorization rules | Keeps legacy `department`/`category_access` OR branches. |
| invoice permission legacy | [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts) | 75 | `canSaveInvoiceServer` | server permission | `role`, `department_scope`, `department`, `category_access` | active runtime dependency | yes | scope-only server authorization rules | Includes legacy `manager && scope == null` branch. |
| payment permission legacy | [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts) | 95 | `canConfirmPaymentServer` | server permission | `role`, `department_scope`, `department`, `category_access` | active runtime dependency | yes | scope-only server authorization rules | Transitional fallback still active. |
| department mirror bridge | [lib/profileDepartmentSync.ts](lib/profileDepartmentSync.ts) | 29 | `mirrorLegacyDepartmentFromScope` | sync bridge | `department_scope -> department` mapping | bridge logic | yes | `department_scope` only | Technical bridge for legacy CHECK/RLS constraints. |
| update mirror write | [services/supabaseService.ts](services/supabaseService.ts) | 967 | `usersService.update` | sync bridge | `updates.departmentScope`, `department_scope`, mirrored `department` | active runtime dependency | yes | `department_scope` only | Writes both canonical + mirrored legacy fields. |
| create-user mirror write | [supabase/functions/admin-create-user/index.ts](supabase/functions/admin-create-user/index.ts) | 25 | local `mirrorLegacyDepartmentFromScope` | sync bridge | `departmentScope`, `department_scope`, mirrored `department` | active runtime dependency | yes | `department_scope` only | Edge function mirrors department for inserted/upserted profile rows. |
| invite mirror/fallback write | [supabase/functions/invite-user/index.ts](supabase/functions/invite-user/index.ts) | 107 | local `mirrorLegacyDepartmentFromScope` | sync bridge | `departmentScope`, `department`, `category_access` | active runtime dependency | yes | `department_scope` only | If scope absent, flow can still write legacy `department` directly. |
| command-auth profile load | [api/_lib/command-auth.ts](api/_lib/command-auth.ts) | 60 | `requireCommandProfile` | server auth | `department`, `department_scope`, `category_access`, capability flags | active runtime dependency | yes | normalized command-auth contract | Legacy fields are loaded because downstream permission helpers still depend on them. |
| command-auth normalization | [api/_lib/command-auth.ts](api/_lib/command-auth.ts) | 43 | `normalizeProfile` | server auth | `role`, `department`, `department_scope`, `is_active`, flags | compatibility fallback | yes | strict canonical command-auth shape | Coercion/defaulting keeps transitional behavior stable. |
| worker shape compatibility | [services/supabaseService.ts](services/supabaseService.ts) | 3244 | `transformWorkerFromDB` | profile transform | `department_scope`, `department`, `category_access`, `role`, flags, names | active runtime dependency | yes | caller-specific explicit contracts | Central compatibility shaping for session/admin/operational callers. |
| scope resolver fallback | [services/supabaseService.ts](services/supabaseService.ts) | 3232 | `resolveDepartmentScopeFromDb` | profile transform | `department_scope`, `department` | compatibility fallback | yes | `department_scope` only | Falls back to legacy `department` when scope unresolved. |
| session bootstrap dependency | [contexts/WorkerContext.tsx](contexts/WorkerContext.tsx) | 138 | `getCurrentWorker` | client UI | transformed `Worker` from session profile row | active runtime dependency | yes | explicit session contract with reduced transform fallback | Session path depends on transform fallback behavior today. |
| deprecated invite branch | [services/supabaseService.ts](services/supabaseService.ts) | 807 | `usersService.createWithoutInvite` | unknown | `departmentScope` passed to invite function | unclear / manual review needed | no | explicit admin-create-user path only | Missing evidence: external invocations outside repo. Need runtime telemetry / endpoint logs to prove dead. |

### Mandatory search matrix (evidence)

| Symbol/pattern | File path | Line | Enclosing symbol | Bucket | Notes |
|---|---|---:|---|---|---|
| `category_access` | [lib/permissions.ts](lib/permissions.ts) | 44 | `canViewModule` docs + body | bridge/fallback logic | Unresolved scope branch falls back to category access. |
| `category_access` | [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts) | 48 | `categoryAccessIncludesNormalizedToken` | bridge/fallback logic | Transitional token gate helper. |
| `category_access` | [api/_lib/command-auth.ts](api/_lib/command-auth.ts) | 81 | `requireCommandProfile` | runtime dependency | Field is loaded for command authorization path. |
| `category_access ||` | — | — | — | unclear/manual review needed | Missing evidence: no direct `||` fallback expression found in code. Runtime certainty not applicable for this exact syntax pattern. To prove/disprove, run semantic scan for equivalent fallback expressions (`Array.isArray(...) ? ... : ...`). |
| `category_access ??` | — | — | — | unclear/manual review needed | Missing evidence: no `??` usage found. Equivalent behavior exists via ternary/default logic in transform and permission helpers. |
| `department_scope` | [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts) | 25 | `effectiveDepartmentScope` | runtime dependency | Scope-first resolver used by all command permission gates. |
| `department_scope` | [services/supabaseService.ts](services/supabaseService.ts) | 997 | `usersService.update` | runtime dependency | Writes canonical scope and mirrored legacy department. |
| `department_scope` | [supabase/functions/invite-user/index.ts](supabase/functions/invite-user/index.ts) | 578 | invite profile upsert block | bridge/fallback logic | Writes scope when present, legacy-only fallback when absent. |
| `department` | [services/supabaseService.ts](services/supabaseService.ts) | 998 | `usersService.update` | bridge/fallback logic | Mirrored write from scope through sync helper. |
| `department` | [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts) | 66 | `canCreateOffersServer` | bridge/fallback logic | Legacy OR branch (`department === 'sales'`). |
| `profileDepartmentSync` / mirror helper | [lib/profileDepartmentSync.ts](lib/profileDepartmentSync.ts) | 29 | `mirrorLegacyDepartmentFromScope` | definition only | Canonical sync bridge definition. |
| `profileDepartmentSync` / mirror helper | [services/supabaseService.ts](services/supabaseService.ts) | 1 | module import | runtime dependency | Active usage in user update flow. |
| `transformWorkerFromDB` | [services/supabaseService.ts](services/supabaseService.ts) | 3244 | `transformWorkerFromDB` | definition only | Main profile compatibility transform. |
| `transformWorkerFromDB` | [contexts/WorkerContext.tsx](contexts/WorkerContext.tsx) | 138 | `getCurrentWorker` | runtime dependency | Session bootstrap depends on transform. |
| `manager && scope == null` | [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts) | 88 | `canSaveInvoiceServer` | bridge/fallback logic | Legacy broad-allow branch for unresolved manager scope. |
| `scope == null` | [lib/permissions.ts](lib/permissions.ts) | 101 | `canAccessDepartment` | runtime dependency | Strict deny for unresolved scope in department access helper. |
| `scope == null` | [components/kanban/KanbanBoard.tsx](components/kanban/KanbanBoard.tsx) | 31 | `filterTasksByManagerScope` | runtime dependency | UI scope-null treated as broad for tasks filtering. |
| `scope === null` | — | — | — | unclear/manual review needed | Missing evidence: exact strict-null pattern not found. Equivalent null checks use `== null`. |
| `scope == undefined` | — | — | — | unclear/manual review needed | Missing evidence: exact undefined-comparison pattern not found. Equivalent checks use `== null`. |
| `!scope` | [components/admin/UserManagement.tsx](components/admin/UserManagement.tsx) | 93 | local scope-label helper | runtime dependency | Falsy scope display handling in admin UI labeling (not permission gate). |
| `scope ??` | — | — | — | unclear/manual review needed | Missing evidence: exact pattern not found. Nullish handling is done with `if`/ternary branches. |
| `department_scope ?? department` | — | — | — | unclear/manual review needed | Missing evidence: exact syntax absent. Equivalent fallback implemented in resolver functions. |
| `department || department_scope` | — | — | — | unclear/manual review needed | Missing evidence: exact syntax absent. Equivalent ordering appears in explicit resolver code. |
| unresolved-scope fallback pattern | [lib/permissions.ts](lib/permissions.ts) | 78 | `canViewModule` | bridge/fallback logic | Explicit unresolved-scope category fallback path. |
| unresolved-scope fallback pattern | [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts) | 85 | `canSaveInvoiceServer` | bridge/fallback logic | Explicit unresolved-scope legacy manager branch. |
| `category_access` (docs mention) | [docs/phase-3a-server-permissions.md](docs/phase-3a-server-permissions.md) | 8 | docs text | docs/reference-only | Documentation evidence only. |

### Runtime vs compatibility distinction

- **Real runtime dependencies now:** command endpoints call `requireCommandProfile + assertCan*` gates; `WorkerContext` and worker/admin service paths depend on `transformWorkerFromDB`; user update/create/invite flows actively mirror `department_scope -> department`.
- **Compatibility fallback/bridge logic now:** `category_access` unresolved-scope fallback, legacy `department` OR branches, `manager && scope == null` branch, and transform default coercions.
- **Unclear rows:** exact syntactic patterns (`scope ??`, `category_access ??`, etc.) are absent; equivalent semantics are implemented via explicit branches. Additional proof requires runtime tracing or semantic pattern checks, not direct regex hits.

### Cleanup readiness analysis by track

| Track | can cleanup start now | blockers | migration prerequisites | risk | reason |
|---|---|---|---|---|---|
| Track A — `category_access` | no | Client/server fallbacks still active in permission decisions | Backfill/resolve `department_scope`; remove fallback branches in client + server + SQL helper logic with parity tests | high | Removing now can deny legitimate legacy users or skew authorization parity. |
| Track B — `department` bridge | no | Active mirror writes in update/create/invite flows; fallback readers still used | Enforce canonical `department_scope`; disable legacy-only writes; align RLS/helper assumptions | high | Premature removal breaks profile write compatibility and legacy permission paths. |
| Track C — server permission branches | no | Command gates still use legacy OR branches and unresolved manager branch | Scope-only decision policy + staged parity tests on create offers/save invoice/confirm payment | high | Direct authorization regression risk (over-deny or over-grant). |
| Track D — command-auth shape | no | Command profile still loads legacy fields consumed by server-permissions | First migrate server-permissions to canonical contract; then shrink command-auth selected shape | medium-high | Shape cleanup depends on C; otherwise fields removed while still read at runtime. |
| Track E — `transformWorkerFromDB` | no | Session/admin/operational callers depend on compatibility defaults/coercions | Define caller-specific strict contracts and ensure canonical data completeness before reducing defaults | medium-high | UI/profile regressions likely if defaults removed before contract hardening. |

### Recommended next phase order (reasoned)

1. **Track B prep (department bridge hardening and data readiness)**
   - Why before next: reduces unknown/unresolved scope rows feeding permission fallbacks.
   - Risk reduced: prevents auth drift when server branches are tightened.
   - Unlocks: safe removal path for legacy permission branches (Track C).
2. **Track C (server permission branch cleanup)**
   - Why before next: command authorization behavior must be canonicalized before shrinking auth shape.
   - Risk reduced: avoids removing required legacy fields while still referenced by live gates.
   - Unlocks: command-auth contract minimization (Track D).
3. **Track D (command-auth profile shape cleanup)**
   - Why before next: once server gates are canonical, legacy profile fields can be removed from auth load.
   - Risk reduced: avoids stale/unused auth payload coupling.
   - Unlocks: safer client fallback removals and stronger contract parity.
4. **Track A (`category_access` fallback removal)**
   - Why before next: permissions become fully scope-driven after server/auth alignment.
   - Risk reduced: minimizes client/server divergence in access decisions.
   - Unlocks: transform simplification by removing category fallback dependence.
5. **Track E (`transformWorkerFromDB` compatibility cleanup)**
   - Why last: depends on upstream canonical contracts being stable.
   - Risk reduced: avoids broad UI regressions from premature fallback removal.
   - Unlocks: final strict read-model contracts with reduced transform complexity.

### Executive summary

- 4I confirms legacy compatibility dependencies are still active across permission checks, command auth profile loading, department mirroring, and worker transform shaping.
- No audited track (A-E) is ready for direct cleanup now; each still has runtime dependencies or prerequisites.
- The least risky sequence is to stabilize data/bridge and permission contracts first (B -> C -> D), then remove category fallback (A), then tighten transform contracts (E).

**Future contract target state (after cleanup):**
- `category_access` fallback removed; scope/permission model is canonical.
- Legacy `department` mirror bridge removed; `department_scope` is sole profile scope source of truth.
- Server permission checks rely only on normalized scope-based contract.
- Command-auth profile shape contains only canonical authorization fields.
- `transformWorkerFromDB` compatibility defaults are minimized and replaced by caller-specific explicit contracts.

---

## Phase 4J — Track B prep (department / department_scope bridge hardening + data readiness)

4J is **non-destructive prep only**. No bridge removal, no behavior/RLS/schema changes.

### Exact Track B bridge dependency map

| File path | Line | Enclosing symbol | Runtime role | Direction | Fields relied on | Classification | blocks Track B cleanup directly | target canonical source after cleanup | Notes |
|---|---:|---|---|---|---|---|---|---|---|
| [lib/profileDepartmentSync.ts](lib/profileDepartmentSync.ts) | 29 | `mirrorLegacyDepartmentFromScope` | sync bridge | scope -> department mirror write | `department_scope`, `department` | bridge logic | yes | `department_scope` | Canonical mapper used by active write paths. |
| [services/supabaseService.ts](services/supabaseService.ts) | 996 | `usersService.update` | write path | dual-write | `department_scope`, mirrored `department` | active runtime dependency | yes | `department_scope` | UI/admin update flow writes both fields. |
| [supabase/functions/admin-create-user/index.ts](supabase/functions/admin-create-user/index.ts) | 25 | local `mirrorLegacyDepartmentFromScope` | write path | scope -> department mirror write | `departmentScope`, `department` | bridge logic | yes | `department_scope` | Duplicated helper logic in edge function. |
| [supabase/functions/admin-create-user/index.ts](supabase/functions/admin-create-user/index.ts) | 160 | `serve` profile upsert block | write path | dual-write | `department_scope`, `department` | active runtime dependency | yes | `department_scope` | Authoritative create flow currently mirrors legacy field. |
| [supabase/functions/invite-user/index.ts](supabase/functions/invite-user/index.ts) | 108 | local `mirrorLegacyDepartmentFromScope` | write path | scope -> department mirror write | `departmentScope`, `department` | bridge logic | yes | `department_scope` | Duplicated helper logic in invite flow. |
| [supabase/functions/invite-user/index.ts](supabase/functions/invite-user/index.ts) | 577 | `serve` profile write block | write path | dual-write / legacy-only write | `department_scope`, `department`, `category_access` | active runtime dependency | yes | `department_scope` | If scope missing, branch can still write only legacy `department`. |
| [services/supabaseService.ts](services/supabaseService.ts) | 3232 | `resolveDepartmentScopeFromDb` | profile transform | department -> scope fallback read | `department_scope`, `department` | compatibility fallback | yes | `department_scope` | Core read fallback from legacy department when scope unresolved. |
| [services/supabaseService.ts](services/supabaseService.ts) | 3244 | `transformWorkerFromDB` | profile transform | dual-read | `department_scope`, `department`, other worker fields | active runtime dependency | yes | caller-specific explicit contracts | Outputs both legacy and canonical forms today. |
| [contexts/WorkerContext.tsx](contexts/WorkerContext.tsx) | 138 | `getCurrentWorker` | client UI | dual-read (via transform) | transformed profile row | active runtime dependency | yes | strict session profile contract | Session boot path depends on transform fallback behavior. |
| [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts) | 26 | `effectiveDepartmentScope` | server permission | department -> scope fallback read | `department_scope`, `department` | compatibility fallback | yes | `department_scope` | Server authz resolver still fallback-capable. |
| [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts) | 60/75/95 | `canCreateOffersServer` / `canSaveInvoiceServer` / `canConfirmPaymentServer` | server permission | dual-read | `department_scope`, `department`, `category_access`, `role` | active runtime dependency | yes | scope-first permission contract | Command gates still include legacy branches. |
| [api/_lib/command-auth.ts](api/_lib/command-auth.ts) | 80 | `requireCommandProfile` | server auth | dual-read | selected `department`, `department_scope`, flags | active runtime dependency | yes | normalized command-auth contract | Loads both fields because server permission helpers still need them. |
| [services/supabaseService.ts](services/supabaseService.ts) | 807 | `usersService.createWithoutInvite` | unknown | write-path wrapper | `departmentScope` via invite flow | unclear / manual review needed | no | admin-create-user canonical path | Missing evidence: external callers outside repo. Proof needed: runtime logs/telemetry. |

### Mandatory search matrix (Track B evidence)

| Symbol/pattern | File path | Line | Enclosing symbol | Bucket | Notes |
|---|---|---:|---|---|---|
| `department_scope` | [services/supabaseService.ts](services/supabaseService.ts) | 997 | `usersService.update` | write path | Canonical scope write + mirror assignment. |
| `department` | [services/supabaseService.ts](services/supabaseService.ts) | 998 | `usersService.update` | write path | Legacy mirror write derived from scope. |
| `mirrorLegacyDepartmentFromScope` | [lib/profileDepartmentSync.ts](lib/profileDepartmentSync.ts) | 29 | `mirrorLegacyDepartmentFromScope` | definition only | Canonical bridge helper definition. |
| `mirrorLegacyDepartmentFromScope` | [supabase/functions/admin-create-user/index.ts](supabase/functions/admin-create-user/index.ts) | 25 | local helper | write path | Duplicated helper implementation in edge function. |
| `mirrorLegacyDepartmentFromScope` | [supabase/functions/invite-user/index.ts](supabase/functions/invite-user/index.ts) | 108 | local helper | write path | Duplicated helper implementation in invite flow. |
| `resolveDepartmentScopeFromDb` | [services/supabaseService.ts](services/supabaseService.ts) | 3232 | `resolveDepartmentScopeFromDb` | bridge/fallback logic | Canonical-first then legacy fallback read. |
| `transformWorkerFromDB` | [services/supabaseService.ts](services/supabaseService.ts) | 3244 | `transformWorkerFromDB` | runtime dependency | Active compatibility shaping in read models. |
| `usersService.update` | [services/supabaseService.ts](services/supabaseService.ts) | 967 | `usersService.update` | write path | Main UI update path with dual-write behavior. |
| `createWithoutInvite` | [services/supabaseService.ts](services/supabaseService.ts) | 807 | `usersService.createWithoutInvite` | unclear/manual review needed | Missing evidence: no repo callers. Need endpoint telemetry to prove deadness. |
| admin-create-user profile upsert | [supabase/functions/admin-create-user/index.ts](supabase/functions/admin-create-user/index.ts) | 160 | `serve` handler | write path | Upsert writes both `department_scope` and mirrored `department`. |
| invite-user profile upsert | [supabase/functions/invite-user/index.ts](supabase/functions/invite-user/index.ts) | 589 | `serve` handler | write path | Mixed semantics; may write legacy-only `department` if scope absent. |
| explicit `department:` profile write | [supabase/functions/admin-create-user/index.ts](supabase/functions/admin-create-user/index.ts) | 171 | profile upsert payload | write path | Explicit legacy write retained for compatibility. |
| explicit `department_scope:` profile write | [supabase/functions/admin-create-user/index.ts](supabase/functions/admin-create-user/index.ts) | 170 | profile upsert payload | write path | Explicit canonical scope write. |
| explicit `department_scope:` profile write | [supabase/functions/invite-user/index.ts](supabase/functions/invite-user/index.ts) | 578 | profile data build | write path | Written only when scope present. |
| explicit `department:` profile write | [supabase/functions/invite-user/index.ts](supabase/functions/invite-user/index.ts) | 580 | profile data build | write path | Legacy fallback write path still present. |

### Track B preparation checklist (before any bridge removal)

1. **Canonical write-path strategy**
   - Define scope-first profile write contract: active create/update/invite paths must provide valid `department_scope`.
   - Keep mirror write temporary where RLS/server compatibility still requires it.
2. **Write-path hardening readiness**
   - Verify `usersService.update`, `admin-create-user`, and `invite-user` can all operate scope-first.
   - Explicitly identify branches that still allow legacy-only `department` writes.
3. **Data-readiness checks**
   - Confirm active-user coverage for valid `department_scope` (define target threshold before destructive cleanup).
   - Confirm whether any runtime flow can still create rows with legacy-only `department`.
   - Confirm command auth/permission paths that still fail if mirror is absent.
   - Confirm RLS/helper assumptions that still depend on mirrored `department`.
4. **Go/no-go gate artifact**
   - Produce a pass/fail checklist + unresolved risks list.
   - Output explicit decision: `not safe yet` / `safe to start destructive Track B`.

### Recommended 4J execution split

- **4J1 — Write-path hardening (non-destructive)**
  - Why first: stops new bridge debt from being created.
  - Risk reduced: prevents legacy-only writes from reappearing during migration.
  - Unlocks: meaningful fallback-read reduction prep.
- **4J2 — Fallback-read reduction prep (non-destructive)**
  - Why second: safe only after write contracts are hardened.
  - Risk reduced: avoids auth/profile regressions from premature fallback edits.
  - Unlocks: objective bridge-removal prechecks.
- **4J3 — Bridge-removal readiness gate (still prep)**
  - Why third: requires evidence from 4J1/4J2.
  - Risk reduced: avoids partial destructive cleanup with hidden dependencies.
  - Unlocks: first destructive Track B cleanup phase (outside 4J).

### Master document inconsistency cleanup targets (doc-only)

- Updated stale “active/transitional” references for removed transitional full-profile methods (4H already removed them).
- Marked old sequence/recommendation sections as **historical snapshots** to avoid conflict with 4I/4J ordering.
- Corrected 4G search-matrix row that referenced a docs mention no longer present.
- Next cleanup pass should also normalize phase-label collisions (older vs newer Phase 4 labels) into one canonical naming scheme.

---

## Phase 4J1 — Scope-first write-path hardening (non-destructive)

4J1 keeps compatibility mirroring, but hardens active write paths so `department_scope` remains the canonical write input.

### Per-write-path hardening summary

| Write path | 4J1 hardening | Canonical input after 4J1 | Compatibility output after 4J1 | Legacy-only input still allowed |
|---|---|---|---|---|
| `usersService.update` ([services/supabaseService.ts](services/supabaseService.ts)) | Added runtime validation for canonical scope before write; mirror still derived from scope helper. | `departmentScope` (validated canonical scope only) | mirrored `department` via `mirrorLegacyDepartmentFromScope` | no |
| `admin-create-user` ([supabase/functions/admin-create-user/index.ts](supabase/functions/admin-create-user/index.ts)) | Already strict scope-first; kept explicit scope validation and mirror write. | `departmentScope` (required + validated) | mirrored `department` from scope | no |
| `invite-user` ([supabase/functions/invite-user/index.ts](supabase/functions/invite-user/index.ts)) | Added scope normalization step; if only legacy department is provided and mappable, converts to scope-first write and mirrors from normalized scope. | `departmentScope` when present; else derived canonical scope from mappable legacy department | mirrored `department` via mirror helper from canonical/derived scope | yes (only for legacy department values that cannot be safely mapped) |
| `usersService.createWithoutInvite` ([services/supabaseService.ts](services/supabaseService.ts)) | Added runtime canonical scope validation before calling `invite-user`; no repo-visible caller changes. | `departmentScope` (validated canonical scope only) | delegated mirror behavior through `invite-user` | no (on this client path) |

### Legacy-only row prevention check (mandatory)

| Write path | Can still write row with `department` but no `department_scope`? | Why / blocker |
|---|---|---|
| `usersService.update` | no | Scope validation blocks non-canonical input; update writes both fields from scope. |
| `admin-create-user` | no | Request rejects invalid/missing scope; upsert always includes `department_scope`. |
| `invite-user` | yes (controlled transitional branch) | External callers may still send legacy-only department values that are not safely mappable. Preserved intentionally to avoid risky behavior break. |
| `usersService.createWithoutInvite` | no | Client path now validates scope before calling edge function. |

### `createWithoutInvite` explicit status (mandatory)

- **repo-visible active caller:** no (no repo hit found for direct method calls).
- **externally callable risk:** yes (method still exported in service layer; external/manual invocation remains possible).
- **4J1 action taken:** retained transitional path with stricter scope validation; no removal in 4J1.

### Compatibility mirroring intentionally retained

- `mirrorLegacyDepartmentFromScope` remains the compatibility output bridge for downstream assumptions (server permission fallbacks, command-auth shape, transform/read fallback, and RLS-era compatibility constraints).
- 4J1 intentionally does **not** remove mirror helper, legacy column, or fallback readers.

### Remaining 4J2 blockers

1. `invite-user` still contains a controlled legacy-only branch for unmappable department-only input.
2. Server auth/permission paths still consume legacy-compatible shape (`department` fallback branches).
3. `resolveDepartmentScopeFromDb` and `transformWorkerFromDB` still implement read-time fallback coupling.

### 4J2 readiness

- **Can 4J2 begin next:** yes, with blockers explicitly tracked.
- **4J2 focus:** reduce fallback-read coupling and narrow legacy-only input acceptance in edge invite flow using production-call telemetry and compatibility checks before further tightening.

---

## Phase 4J2 — Fallback-read reduction readiness (non-destructive, tightened)

4J2 is preparation/audit only. No fallback logic was removed and no permission/session behavior was changed.

### Exact fallback-read dependency map

| Dependency | File path | Line | Enclosing symbol | Runtime role | Fallback direction | Fields relied on | Classification | blocks fallback-read reduction directly | target canonical source after cleanup | behavior owner after cleanup | can be narrowed now without behavior change | can be isolated now without behavior change | UI blast radius if narrowed later | Notes |
|---|---|---:|---|---|---|---|---|---|---|---|---|---|---|---|
| scope resolver in transform layer | [services/supabaseService.ts](services/supabaseService.ts) | 3262 | `resolveDepartmentScopeFromDb` | profile transform | department -> scope fallback read | `department_scope`, `department` | compatibility fallback | yes | `department_scope` | profile transform layer (`services/supabaseService.ts`) | no | yes | Session bootstrap + dashboard/profile consumers of transformed worker | Shared by all worker/admin reads; narrowing now risks shape/visibility drift. |
| compatibility worker shaping | [services/supabaseService.ts](services/supabaseService.ts) | 3274 | `transformWorkerFromDB` | profile transform | dual-read compatibility + fallback-shaped output | `department_scope`, `department`, `category_access`, flags, names | fallback-shaped output | yes | caller-specific strict read-model contracts | profile transform + downstream consumers | no | partial (by consumer segmentation only) | WorkerContext session load, Admin/UserManagement reads, operational worker lists | Isolation requires staged contract split before narrowing/removal. |
| session bootstrap consumer | [contexts/WorkerContext.tsx](contexts/WorkerContext.tsx) | 138 | `getCurrentWorker` | session bootstrap | fallback-shaped output | transformed session profile | active runtime dependency | yes | explicit session profile contract | session/bootstrap (`WorkerContext`) | no | no | Login/session bootstrap; module visibility and role/scope UI state | Tight coupling to transformed fallback shape keeps this path non-isolatable now. |
| server scope resolver | [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts) | 26 | `effectiveDepartmentScope` | server permission | department -> scope fallback read | `department_scope`, `department` | compatibility fallback | yes | scope-only server permission contract | server permission layer | no | no | n/a (server authz blast radius, not UI) | Narrowing now changes effective command authorization outcomes. |
| server permission branches | [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts) | 60/75/95 | `canCreateOffersServer` / `canSaveInvoiceServer` / `canConfirmPaymentServer` | server permission | dual-read compatibility | `department_scope`, `department`, `category_access`, `role` | active runtime dependency | yes | canonical scope-based permission rules | server permission layer | no | no | n/a (server authz blast radius) | Includes legacy branches + `manager && scope == null`. |
| command profile load shape | [api/_lib/command-auth.ts](api/_lib/command-auth.ts) | 60 | `requireCommandProfile` | server auth | dual-read compatibility | `department`, `department_scope`, `category_access`, capability flags | active runtime dependency | yes | normalized command-auth profile contract | command-auth layer | no | yes (shape isolation behind adapter) | n/a (indirect UI impact via command outcomes) | Must remain until Track C removes legacy permission reads. |
| command profile normalization | [api/_lib/command-auth.ts](api/_lib/command-auth.ts) | 43 | `normalizeProfile` | server auth | fallback-shaped output | `department`, `department_scope`, flags | compatibility fallback | yes | strict canonical command-auth shape | command-auth layer | no | yes (adapter boundary) | n/a | Can be isolated behind canonical adapter, not narrowed yet. |
| controlled legacy write blocker input | [supabase/functions/invite-user/index.ts](supabase/functions/invite-user/index.ts) | 580 | profile write build block | unknown | fallback-shaped output source | legacy `department` unmappable branch | unclear / manual review needed | yes | scope-first invite input contract | invite-user flow owner | no | no | n/a | Missing evidence: external caller payload distribution. Need telemetry to prove safe narrowing path. |

### Mandatory search matrix (highlights)

| Symbol/pattern | File path | Line | Enclosing symbol | Bucket | Notes |
|---|---|---:|---|---|---|
| `resolveDepartmentScopeFromDb` | [services/supabaseService.ts](services/supabaseService.ts) | 3262 | `resolveDepartmentScopeFromDb` | definition only | Canonical fallback resolver definition. |
| `transformWorkerFromDB` | [services/supabaseService.ts](services/supabaseService.ts) | 3274 | `transformWorkerFromDB` | fallback-shaped output | Emits worker object with canonical+legacy-compatible fields. |
| `transformWorkerFromDB` | [contexts/WorkerContext.tsx](contexts/WorkerContext.tsx) | 138 | `getCurrentWorker` | runtime dependency | Session bootstrap depends on transformed fallback-shaped worker. |
| `effectiveDepartmentScope` | [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts) | 26 | `effectiveDepartmentScope` | bridge/fallback logic | Scope resolver with legacy department fallback. |
| `requireCommandProfile` | [api/_lib/command-auth.ts](api/_lib/command-auth.ts) | 60 | `requireCommandProfile` | runtime dependency | Loads legacy+canonical fields used by permission helpers. |
| `normalizeProfile` | [api/_lib/command-auth.ts](api/_lib/command-auth.ts) | 43 | `normalizeProfile` | fallback-shaped output | Normalizes profile into compatibility shape. |
| `department_scope` | [api/_lib/command-auth.ts](api/_lib/command-auth.ts) | 81 | profile select list | runtime dependency | Canonical field loaded with legacy shape fields. |
| `department` | [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts) | 66 | `canCreateOffersServer` | bridge/fallback logic | Legacy department branch still active. |
| `scope == null` | [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts) | 88 | `canSaveInvoiceServer` | bridge/fallback logic | Transitional manager unresolved-scope broad allow. |
| `department ===` | [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts) | 66 | `canCreateOffersServer` | runtime dependency | Exact legacy equality checks in active authz path. |
| `category_access` | [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts) | 48 | `categoryAccessIncludesNormalizedToken` | bridge/fallback logic | Transitional category fallback in server permissions. |
| `manager && scope == null` | [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts) | 88 | `canSaveInvoiceServer` | bridge/fallback logic | High-risk authz compatibility branch. |
| scope from legacy department branch | [services/supabaseService.ts](services/supabaseService.ts) | 3267 | `resolveDepartmentScopeFromDb` | bridge/fallback logic | `department` fallback mapping if canonical scope missing. |
| emits canonical+legacy shaped worker | [services/supabaseService.ts](services/supabaseService.ts) | 3298 | `transformWorkerFromDB` return object | fallback-shaped output | Keeps both `departmentScope` and legacy-compatible `department`. |
| invite transitional unmappable branch | [supabase/functions/invite-user/index.ts](supabase/functions/invite-user/index.ts) | 580 | profile write build block | unclear/manual review needed | Missing evidence: real external payload prevalence for unmappable legacy department values. Proof needed: edge telemetry + payload sampling. |

### Narrow later vs must remain now

- **Must remain now (cannot narrow without behavior change):**
  - `effectiveDepartmentScope` + legacy permission branches in server-permissions (Track C blocker).
  - `resolveDepartmentScopeFromDb` and current `transformWorkerFromDB` behavior for live consumer set (Track E blocker).
  - session bootstrap dependency on transformed compatibility shape in `WorkerContext` (Track E blocker).
- **Can be isolated now (but not narrowed yet):**
  - `requireCommandProfile` and `normalizeProfile` behind a stricter adapter boundary while keeping legacy-loaded shape for current permission helpers (Track D prep).
  - `transformWorkerFromDB` usage segmentation by consumer type (session/admin/operational contracts) without changing behavior yet (Track E prep).
- **Can be narrowed later (after prerequisites):**
  - command-auth legacy-loaded fields after Track C canonicalizes permission branches.
  - transform fallback behavior after Track E establishes strict consumer contracts and confirms canonical data completeness.

### 4J3 readiness inputs

Checklist output:
1. Active read paths functioning without `department -> scope` fallback: **no**.
2. Server auth/permission still coupled to legacy `department`/`category_access`: **yes**.
3. Session bootstrap still dependent on fallback-shaped transform output: **yes**.
4. Invite transitional unmappable branch still a blocker input: **yes**.

- **4J3 ready:** **no**.
- **Blocking tracks before 4J3:** Track C (server permission cleanup), Track D (command-auth shape cleanup), Track E (transform/session contract cleanup), plus invite-user telemetry for unmappable legacy input branch.

---

## Phase 4K — Track C prep (server permission branch cleanup, scope-first authorization)

4K is planning/audit only. No server permission behavior changes were made.

### Exact Track C server-permission dependency map

| Dependency | File path | Line | Enclosing symbol | Runtime role | Authorization dependency type | Fields relied on | Classification | blocks Track C cleanup directly | target canonical authorization rule after cleanup | behavior owner after cleanup | blocker type | Notes |
|---|---|---:|---|---|---|---|---|---|---|---|---|---|
| scope-first resolver (primary) | [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts) | 27 | `effectiveDepartmentScope` | server permission | scope-first canonical | `department_scope` | active runtime dependency | no | Use validated canonical `department_scope` only | server permission layer | technical blocker | Canonical branch already present. |
| legacy dept fallback inside resolver | [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts) | 29 | `effectiveDepartmentScope` | server permission | legacy department fallback | `department` | compatibility fallback | yes | Remove fallback; resolver becomes scope-only | server permission layer | data evidence blocker | Requires proof that unresolved/legacy dept users are no longer needed for authz. |
| legacy category token helper | [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts) | 48 | `categoryAccessIncludesNormalizedToken` | server permission | legacy category_access fallback | `category_access` | compatibility fallback | yes | Remove category-based server authz decisions | server permission layer | data evidence blocker | Shared by create/save/confirm checks. |
| offers server gate | [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts) | 60 | `canCreateOffersServer` | server permission | mixed canonical + legacy | `role`, `department_scope`, `department`, `category_access` | active runtime dependency | yes | Role+scope matrix only (no legacy OR) | command API authorization | technical blocker | Legacy OR branches still active. |
| invoice save gate | [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts) | 75 | `canSaveInvoiceServer` | server permission | mixed canonical + legacy + unresolved broad allow | `role`, `department_scope`, `department`, `category_access` | high-risk authz branch | yes | Role+scope matrix only; remove unresolved broad allow | command API authorization | policy/product decision needed | Contains `manager && scope == null` emergency allow. |
| confirm payment gate | [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts) | 95 | `canConfirmPaymentServer` | server permission | mixed canonical + legacy | `role`, `department_scope`, `department`, `category_access` | active runtime dependency | yes | Role+scope matrix only (no legacy OR) | command API authorization | technical blocker | Legacy OR still active. |
| command profile loader | [api/_lib/command-auth.ts](api/_lib/command-auth.ts) | 60 | `requireCommandProfile` | server auth | command-auth shape dependency | selected profile shape includes canonical + legacy fields | active runtime dependency | yes | Load canonical-only auth profile after Track C parity | command-auth layer | technical blocker | Track D is blocked by Track C branch cleanup. |
| command profile normalization | [api/_lib/command-auth.ts](api/_lib/command-auth.ts) | 43 | `normalizeProfile` | server auth | command-auth shape dependency | `department`, `department_scope`, flags | compatibility fallback | yes | Strict canonical auth profile normalization | command-auth layer | technical blocker | Currently preserves legacy-loaded fields for permission helpers. |
| create-direct-booking callsite | [api/commands/create-direct-booking.ts](api/commands/create-direct-booking.ts) | 23 | `POST` | API caller | command-auth shape dependency | profile from `requireCommandProfile` | active runtime dependency | no | consume canonicalized `assertCanCreateOffers` | command endpoint owner | data evidence blocker | Endpoint parity proof needed before branch cleanup. |
| create-multi-offer callsite | [api/commands/create-multi-offer.ts](api/commands/create-multi-offer.ts) | 242 | `POST` | API caller | command-auth shape dependency | profile from `requireCommandProfile` | active runtime dependency | no | consume canonicalized `assertCanCreateOffers` | command endpoint owner | data evidence blocker | Endpoint parity proof needed before branch cleanup. |
| save-invoice callsite | [api/commands/save-invoice.ts](api/commands/save-invoice.ts) | 112 | `POST` | API caller | command-auth shape dependency | profile from `requireCommandProfile` | active runtime dependency | no | consume canonicalized `assertCanSaveInvoice` | command endpoint owner | data evidence blocker | Highest-risk endpoint for unresolved-scope users. |
| confirm-payment callsite | [api/commands/confirm-payment.ts](api/commands/confirm-payment.ts) | 102 | `POST` | API caller | command-auth shape dependency | profile from `requireCommandProfile` | active runtime dependency | no | consume canonicalized `assertCanConfirmPayment` | command endpoint owner | data evidence blocker | Needs parity checks after branch isolation. |

### Mandatory search matrix (highlights)

| Symbol/pattern | File path | Line | Enclosing symbol | Bucket | Notes |
|---|---|---:|---|---|---|
| `effectiveDepartmentScope` | [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts) | 26 | `effectiveDepartmentScope` | definition only | Core scope resolver with legacy fallback. |
| `canCreateOffersServer` | [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts) | 60 | `canCreateOffersServer` | runtime dependency | Mixed canonical+legacy branch set. |
| `canSaveInvoiceServer` | [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts) | 75 | `canSaveInvoiceServer` | high-risk authz branch | Contains unresolved manager broad allow. |
| `canConfirmPaymentServer` | [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts) | 95 | `canConfirmPaymentServer` | runtime dependency | Legacy OR branches still active. |
| `categoryAccessIncludesNormalizedToken` | [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts) | 48 | helper | compatibility fallback | Legacy category_access token checks. |
| `department ===` | [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts) | 66 | `canCreateOffersServer` | compatibility fallback | Legacy department equality branch. |
| `category_access` | [api/_lib/command-auth.ts](api/_lib/command-auth.ts) | 81 | `requireCommandProfile` select | runtime dependency | Field loaded because permission helpers still use legacy checks. |
| `manager && scope == null` | [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts) | 88 | `canSaveInvoiceServer` | high-risk authz branch | Largest over-grant/behavior-drift risk. |
| `scope == null` | [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts) | 88 | `canSaveInvoiceServer` | compatibility fallback | Unresolved-scope broad allow branch. |
| full scope checks | [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts) | 34 | `hasFullScopeAccess` | runtime dependency | Scope/role full-access helper used in all command gates. |
| `requireCommandProfile` | [api/_lib/command-auth.ts](api/_lib/command-auth.ts) | 60 | `requireCommandProfile` | runtime dependency | Entry-point for command auth profile loading. |
| `normalizeProfile` | [api/_lib/command-auth.ts](api/_lib/command-auth.ts) | 43 | `normalizeProfile` | compatibility fallback | Keeps dual-shape profile contract for legacy permission branches. |
| `assertCanCreateOffers` callsites | [api/commands/create-direct-booking.ts](api/commands/create-direct-booking.ts) | 24 | `POST` | runtime dependency | Endpoint-level consumer of Track C branch behavior. |
| `assertCanSaveInvoice` callsites | [api/commands/save-invoice.ts](api/commands/save-invoice.ts) | 113 | `POST` | runtime dependency | Endpoint-level consumer; sensitive to unresolved scope branch removal. |
| `assertCanConfirmPayment` callsites | [api/commands/confirm-payment.ts](api/commands/confirm-payment.ts) | 103 | `POST` | runtime dependency | Endpoint-level consumer for confirm flow. |

### Per-branch cleanup readiness

| Branch | can remove now without behavior change | can isolate now without behavior change | blocker type | Primary blocker | Deferred to |
|---|---|---|---|---|---|
| `effectiveDepartmentScope` legacy department fallback | no | yes | data evidence blocker | Need proof unresolved/legacy-only profiles no longer require fallback | 4K1 isolate, 4K3 remove |
| `category_access` token fallbacks | no | yes | data evidence blocker | Need endpoint parity proof for legacy users currently authorized via category tokens | 4K1 isolate, 4K3 remove |
| `department` OR branches in create/save/confirm | no | yes | technical blocker | Must canonicalize endpoint rule matrix and verify parity before deletion | 4K2/4K3 |
| `manager && scope == null` branch | no | no | policy/product decision needed | Requires explicit policy decision for unresolved manager behavior | 4K2 policy + 4K3 cleanup |
| command-auth dual legacy shape | no | yes | technical blocker | Server permissions still read legacy fields; Track D cannot proceed first | Track C before Track D |

### Per-endpoint decision table (mandatory)

| Endpoint | Current canonical rule | Current legacy fallback branches | Highest-risk branch | can isolate now | can remove now |
|---|---|---|---|---|---|
| `/api/commands/create-direct-booking` | super/full-scope/sales-scope allow | `department==='sales'`, `category_access` sales token | legacy category token allow | yes | no |
| `/api/commands/create-multi-offer` | super/full-scope/sales-scope allow | `department==='sales'`, `category_access` sales token | legacy category token allow | yes | no |
| `/api/commands/save-invoice` | super/full-scope/accounting-or-sales-scope allow | `department` ORs, `category_access` ORs, `manager && scope == null` | `manager && scope == null` | yes (except high-risk branch) | no |
| `/api/commands/confirm-payment` | super/full-scope/accounting-or-sales-scope allow | `department` ORs, `category_access` sales token | legacy department/scope disagreement | yes | no |

### Scope-disagreement analysis (mandatory)

| Scenario (`department_scope` vs `department`) | Current effective behavior | Affected endpoints | Target canonical behavior after cleanup | Proof needed before behavior change |
|---|---|---|---|---|
| canonical scope non-sales + legacy `department='sales'` | Legacy OR may still allow sales endpoints | create-direct-booking, create-multi-offer, save-invoice, confirm-payment | Authorization should follow canonical scope/role matrix only | Branch-tag telemetry + endpoint parity test showing intended deny/allow outcomes |
| canonical scope non-accounting + legacy `department='accounting'` | Legacy OR may still allow invoice/payment endpoints | save-invoice, confirm-payment | Follow canonical scope only | Disagreement population query + parity runbook |
| canonical scope unresolved (`null`) + role manager | `manager && scope == null` can allow invoice save | save-invoice | Explicit policy: deny unless canonical scope grants access | Product/policy sign-off + staged canary evidence |

### Command-auth coupling analysis (Track D gate)

- **Canonical fields:** `id`, `role`, `is_active`, `department_scope`.
- **Legacy-only fields currently loaded because Track C still needs them:** `department`, `category_access`.
- **Track C prerequisite before Track D:** remove/neutralize legacy server-permission branches so `requireCommandProfile` can shrink safely without authorization drift.

### Proposed Track C staged split

1. **4K1 — isolate legacy branches behind explicit helper boundaries + telemetry tags**
   - Reduces risk of hidden behavior changes.
2. **4K2 — canonical scope-first parity validation per endpoint**
   - Establishes safe rule matrix and disagreement handling policy.
3. **4K3 — remove legacy department/category branches and unresolved manager broad-allow**
   - Allowed only after evidence + policy gates pass.

---

## Phase 4K1 — Track C implementation (non-destructive isolation + telemetry)

4K1 is an isolation/observability step only. Authorization behavior is intentionally unchanged.

### Isolated permission branches in server-permissions

- `api/_lib/server-permissions.ts` now isolates branch logic behind explicit internal helpers:
  - canonical/full-scope helpers
  - legacy department helpers
  - legacy category_access helpers
  - unresolved manager helper
- `canCreateOffersServer`, `canSaveInvoiceServer`, and `canConfirmPaymentServer` remain exported boolean wrappers and return evaluator `.allowed` only.

Exact branch priority order (recorded verbatim):
1. `super_manager`
2. `full_scope_allow`
3. `canonical_scope_allow`
4. `legacy_department_allow`
5. `legacy_category_access_allow`
6. `unresolved_manager_allow`
7. `denied`

### Branch tags and telemetry hooks

- Stable internal tag vocabulary added:
  - `super_manager`
  - `full_scope_allow`
  - `canonical_scope_allow`
  - `legacy_department_allow`
  - `legacy_category_access_allow`
  - `unresolved_manager_allow`
  - `denied`
- Telemetry is internal-only and env-gated:
  - `process.env.PERMISSION_BRANCH_TELEMETRY === '1'`
  - emitted from command auth assert boundary as `[authz-branch]` structured log
  - logs include only permission name, branch tag, role, canonical scope/null marker
  - no profile IDs, tokens, or client payload changes
- Branch tags are not exposed in API responses and do not alter thrown error text/status.

### Per-endpoint branch-tag coverage (for 4K2 parity prep)

| Endpoint | Permission gate | Expected allow tags | Denied-tag coverage |
|---|---|---|---|
| `/api/commands/create-direct-booking` | `assertCanCreateOffers` | `super_manager`, `full_scope_allow`, `canonical_scope_allow`, `legacy_department_allow`, `legacy_category_access_allow` | yes (`denied` returned when none matched) |
| `/api/commands/create-multi-offer` | `assertCanCreateOffers` | `super_manager`, `full_scope_allow`, `canonical_scope_allow`, `legacy_department_allow`, `legacy_category_access_allow` | yes (`denied` returned when none matched) |
| `/api/commands/save-invoice` | `assertCanSaveInvoice` | `super_manager`, `full_scope_allow`, `canonical_scope_allow`, `legacy_department_allow`, `legacy_category_access_allow`, `unresolved_manager_allow` | yes (`denied` returned when none matched) |
| `/api/commands/confirm-payment` | `assertCanConfirmPayment` | `super_manager`, `full_scope_allow`, `canonical_scope_allow`, `legacy_department_allow`, `legacy_category_access_allow` | yes (`denied` returned when none matched) |

### 4K2 evidence now enabled

- Direct branch-path visibility for each command authorization check without changing auth semantics.
- Measurable distribution of canonical vs legacy fallback grants via branch tags.
- Denied-path coverage visibility by endpoint to support parity-risk analysis before any branch removal.
- Track D boundary preserved: command-auth profile select shape remains unchanged in 4K1.

---

## Phase 4K2 — Track C parity validation (canonical vs legacy authorization paths)

4K2 is a validation/measurement/documentation phase only. No authorization behavior changes were made.

### Evidence model split (required)

- **Code-derived parity model:** reachability and parity expectations inferred from evaluator order and endpoint-to-gate wiring.
- **Telemetry-validated parity evidence:** runtime-confirmed branch usage distribution from `[authz-branch]` logs when `PERMISSION_BRANCH_TELEMETRY === '1'`.
- Current repo evidence for this phase is **code-only**; no runtime telemetry snapshot is present in repository inputs for this run.

### Endpoint parity-validation matrix

| Endpoint | Canonical allow paths (code-derived) | Legacy allow paths (code-derived) | Deny path | Highest-risk path | Canonical-only parity appears possible now | Evidence level | Missing evidence |
|---|---|---|---|---|---|---|---|
| `/api/commands/create-direct-booking` | `super_manager`, `full_scope_allow`, `canonical_scope_allow` | `legacy_department_allow`, `legacy_category_access_allow` | `denied` | `legacy_category_access_allow` | no | code-only | Runtime branch-frequency distribution by role/scope; disagreement population sample. |
| `/api/commands/create-multi-offer` | `super_manager`, `full_scope_allow`, `canonical_scope_allow` | `legacy_department_allow`, `legacy_category_access_allow` | `denied` | `legacy_category_access_allow` | no | code-only | Runtime branch-frequency distribution by role/scope; disagreement population sample. |
| `/api/commands/save-invoice` | `super_manager`, `full_scope_allow`, `canonical_scope_allow` | `legacy_department_allow`, `legacy_category_access_allow`, `unresolved_manager_allow` | `denied` | `unresolved_manager_allow` | no | code-only | Runtime rate of `unresolved_manager_allow`; policy-backed acceptance/retirement decision. |
| `/api/commands/confirm-payment` | `super_manager`, `full_scope_allow`, `canonical_scope_allow` | `legacy_department_allow`, `legacy_category_access_allow` | `denied` | `legacy_department_allow` (scope disagreement risk) | no | code-only | Runtime distribution of legacy grants; disagreement cases where canonical vs legacy diverge. |

### Branch-tag interpretation table

| Endpoint | Expected reachable tags from code | Expected rare/exceptional tags (code reasoning) | Tags that block 4K3 if still observed | Evidence level | Required telemetry proof still missing |
|---|---|---|---|---|---|
| `/api/commands/create-direct-booking` | `super_manager`, `full_scope_allow`, `canonical_scope_allow`, `legacy_department_allow`, `legacy_category_access_allow`, `denied` | `legacy_department_allow`, `legacy_category_access_allow`, `denied` | `legacy_department_allow`, `legacy_category_access_allow` | code-only | Time-bucketed branch counts proving legacy tags are zero/near-zero and denied parity understood. |
| `/api/commands/create-multi-offer` | `super_manager`, `full_scope_allow`, `canonical_scope_allow`, `legacy_department_allow`, `legacy_category_access_allow`, `denied` | `legacy_department_allow`, `legacy_category_access_allow`, `denied` | `legacy_department_allow`, `legacy_category_access_allow` | code-only | Time-bucketed branch counts proving legacy tags are zero/near-zero and denied parity understood. |
| `/api/commands/save-invoice` | `super_manager`, `full_scope_allow`, `canonical_scope_allow`, `legacy_department_allow`, `legacy_category_access_allow`, `unresolved_manager_allow`, `denied` | `legacy_department_allow`, `legacy_category_access_allow`, `unresolved_manager_allow`, `denied` | `legacy_department_allow`, `legacy_category_access_allow`, `unresolved_manager_allow` | code-only | Branch frequency for unresolved manager path + explicit policy sign-off on desired replacement behavior. |
| `/api/commands/confirm-payment` | `super_manager`, `full_scope_allow`, `canonical_scope_allow`, `legacy_department_allow`, `legacy_category_access_allow`, `denied` | `legacy_department_allow`, `legacy_category_access_allow`, `denied` | `legacy_department_allow`, `legacy_category_access_allow` | code-only | Runtime evidence that legacy grant paths are zero/near-zero without introducing endpoint regressions. |

### Disagreement-risk analysis

| Disagreement case (`department_scope` vs `department`) | Current effective behavior | Endpoints affected | Risk type | Target canonical behavior | Proof needed before branch removal | Evidence level |
|---|---|---|---|---|---|---|
| Scope non-sales + legacy `department='sales'` | Legacy branch can still authorize sales commands | create-direct-booking, create-multi-offer, save-invoice, confirm-payment | over-grant | Only canonical scope/role should authorize | Telemetry showing legacy sales grants are zero/near-zero plus endpoint parity checks | code-only |
| Scope non-accounting + legacy `department='accounting'` | Legacy department branch can still authorize invoice/confirm | save-invoice, confirm-payment | over-grant | Only canonical scope/role should authorize | Telemetry + sampled disagreement cases + no-regression command checks | code-only |
| Scope unresolved (`null`) + role manager | Invoice path may allow via `unresolved_manager_allow` | save-invoice | policy ambiguity | Explicit policy outcome (deny or alternative canonical rule) | Product/policy decision + telemetry impact estimate before branch removal | code-only |
| Invoice vs confirm legacy category asymmetry (`sales OR accounting` vs `sales`) | Endpoint-specific behavior differs under legacy category fallback | save-invoice, confirm-payment | policy ambiguity | Explicit canonical parity matrix by endpoint | Confirm intended endpoint-level parity contract and validate with telemetry | code-only |

### 4K3 entry gates (go/no-go)

| Gate | Status now | Required proof | Owner | Blocker type | Evidence level |
|---|---|---|---|---|---|
| `legacy_department_allow` zero/near-zero threshold accepted and met | unknown pending telemetry | Runtime branch counts per endpoint over agreed window | command authz owner | telemetry/data evidence blocker | code-only |
| `legacy_category_access_allow` zero/near-zero threshold accepted and met | unknown pending telemetry | Runtime branch counts per endpoint over agreed window | command authz owner | telemetry/data evidence blocker | code-only |
| `unresolved_manager_allow` replacement policy approved | fail | Policy decision on unresolved manager authorization + migration policy | product/auth policy owner | policy/product decision needed | code-only |
| Denied-path parity understood (no unexpected over-deny after cleanup) | unknown pending telemetry | Denied tag distribution + endpoint parity validation runbook | command API owner | telemetry/data evidence blocker | code-only |
| Scope disagreement cases resolved or explicitly accepted | unknown pending telemetry | Disagreement inventory + approved risk acceptance or remediation plan | authz + product owners | telemetry/data evidence blocker | code-only |
| Track D boundary safety preserved through Track C removal sequence | pass (prep) | Keep command-auth shape unchanged until Track C destructive cleanup gates pass | command-auth layer owner | technical blocker (sequencing) | code-only |

Gate rule applied: where runtime frequency/absence is required and telemetry evidence is missing, gate status remains `unknown pending telemetry` (not `pass`).

### Blockers to 4K3 (typed)

- **Technical blocker**
  - Track sequencing: command-auth shape shrink (Track D) must remain blocked until Track C destructive cleanup gates pass.
- **Telemetry/data evidence blockers**
  - Missing runtime branch-frequency evidence for `legacy_department_allow`.
  - Missing runtime branch-frequency evidence for `legacy_category_access_allow`.
  - Missing denied-path parity evidence under candidate canonical-only rules.
  - Missing quantified disagreement population evidence across command endpoints.
- **Policy/product blockers**
  - No approved policy outcome yet for `unresolved_manager_allow`.
  - No explicit sign-off yet on endpoint-level parity expectations for invoice/confirm asymmetry during cleanup transition.

### 4K3 readiness verdict

- **4K3 ready:** **no**.
- Rationale: 4K3 depends on telemetry-backed branch usage proof plus policy decisions not yet satisfied.

---

## Phase 4K2.5 — Telemetry / policy checkpoint before 4K3

4K2.5 is a **checkpoint-only** phase: define how to collect evidence, formalize thresholds and policy, and record a **go/no-go** for destructive Track C (4K3). **No authorization behavior changes** are made in 4K2.5 by this documentation pass. Optional future work (e.g. extended log fields) must remain **non-auth-changing** and requires separate approval.

### 1. Repository evidence summary (checkpoint baseline)

- **Evaluators and tags** are defined in [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts): `evaluateCreateOffersServerDecision`, `evaluateSaveInvoiceServerDecision`, `evaluateConfirmPaymentServerDecision`.
- **Command gates:** [api/commands/create-direct-booking.ts](api/commands/create-direct-booking.ts), [api/commands/create-multi-offer.ts](api/commands/create-multi-offer.ts) → `assertCanCreateOffers`; [api/commands/save-invoice.ts](api/commands/save-invoice.ts) → `assertCanSaveInvoice`; [api/commands/confirm-payment.ts](api/commands/confirm-payment.ts) → `assertCanConfirmPayment` ([api/_lib/command-auth.ts](api/_lib/command-auth.ts)).
- **Current telemetry:** when `PERMISSION_BRANCH_TELEMETRY === '1'`, logs `[authz-branch]` with `permission`, `tag`, `role`, `scope` where `scope` is `profile.department_scope ?? 'null'` only — **not** `effectiveDepartmentScope`, **not** `department`, **not** a disagreement class. Sufficient for **tag × permission × role × coarse scope bucket** counts; **insufficient alone** for full scope-vs-`department` disagreement quantification (use DB analytics or an optional approved log extension).
- **4K2 state:** parity model is **code-only** in-repo; gates that need runtime counts remain **unknown pending telemetry** until 4K2.5 produces telemetry-backed evidence.

### 2. Telemetry collection plan

**Branch tags to observe (minimum)**

| Tag | `permission` values in log | Why it matters | Informs 4K3 |
|---|---|---|---|
| `legacy_department_allow` | `create_offers`, `save_invoice`, `confirm_payment` | Reliance on legacy `department` after canonical path | Safe removal of department OR branches |
| `legacy_category_access_allow` | same | Reliance on `category_access` grant path | Safe removal of category branch |
| `unresolved_manager_allow` | `save_invoice` only | Emergency manager broad allow | Policy + branch removal |
| `denied` | all three | Baseline denies at assert | Over-deny risk after cleanup |
| `canonical_scope_allow` | all three | Canonical path volume | Expected traffic |
| `full_scope_allow` | all three | Scope-`all` path (distinct from super) | Dashboard segmentation |
| `super_manager` | all three | Super path | Usually exempt from legacy-removal gates |

**Environments**

- **Staging:** required minimum; enable telemetry flag; longer windows acceptable if traffic is low.
- **Production:** required for **go/no-go**; privacy review; aggregate in downstream tooling only.

**Duration / sample (planning — not claims)**

- Choose a **review window** per environment (e.g. 7 / 14 / 30 days) and a **minimum event count** per `(permission, tag)` or per permission for statistical meaning (exact numbers: **TBD by owner** after first ingest).
- Include at least **one full business cycle** if usage is weekly-biased (e.g. invoicing spikes).

**Metrics / summaries**

- Counts and rates: `tag` × `permission` × `role` × coarse `department_scope` bucket (`null`, `sales`, `accounting`, `all`, `properties`, other).
- **Denied slice:** `denied` per permission, by `role` and scope bucket.
- **Legacy reliance index (example):** `(legacy_department_allow + legacy_category_access_allow) / (all checks with tag logged for that permission)` — define denominator explicitly to avoid div-by-zero on low traffic.

**Gap: disagreement quantification**

- Not derivable from current log fields alone when `effectiveDepartmentScope` mixes `department_scope` and legacy `department`.
- **Evidence options (pick or combine):** (1) **DB batch analytics** on `profiles` with a documented predicate; (2) optional **4K2.5d** env-gated, non-PII derived log fields — security review; **must not** change allow/deny.

**`denied` visibility trap**

- `denied` is logged only when the request reaches `assertCan*`. Earlier 401/403/400 responses do **not** emit `[authz-branch]`. Do not infer “no denies in logs” means “no access failures globally.”

### 3. 4K3 threshold-definition plan (definitions only — do not claim “met”)

| Signal | Example threshold patterns (to finalize with owners) | Gate meaning | Evidence level until filled |
|---|---|---|---|
| `legacy_department_allow` | Zero **or** formal **near-zero** + signed exception registry | Legacy department OR removable | unknown pending telemetry |
| `legacy_category_access_allow` | Same | Legacy category removable | unknown pending telemetry |
| `unresolved_manager_allow` | Zero **or** policy-approved cap + migration timeline | Remove/replace emergency allow | policy + telemetry |
| `denied` distribution | Understood baseline; post-change **delta bound** | Avoid silent over-deny | unknown pending telemetry |
| Canonical / full_scope / super segments | Expected majority; anomalies investigated | Context for legacy removal | telemetry-backed when collected |
| Disagreement population | Max acceptable count/rate **or** explicit acceptance | Scope-only resolver safety | telemetry/DB |

Each finalized gate row must record: **metric definition**, **review window**, **owner sign-off**, **escape hatch** (exception registry or defer 4K3).

#### Near-zero must be formalized before real go/no-go

Placeholder phrases (“near-zero”, “near-zero with exceptions”) are **not** sufficient for a **pass**. Before 4K3 approval, owners must lock:

| Field | What to record |
|---|---|
| **Event definition** | One event = one `[authz-branch]` line per permission check (plus dedup rules if any). |
| **Units** | One primary metric per gate (e.g. absolute count per window, or share of logged checks for that permission). |
| **Review window** | Exact calendar span(s); staging vs prod may differ; align with billing/monthly cycles if relevant. |
| **Statistical floor** | Minimum total volume so “near-zero” is not noise on sparse endpoints. |
| **Near-zero numeric bound** | e.g. ≤ N events per window **or** ≤ p% — **set in 4K2.5b** after volumes exist; approver named. |
| **Exception path** | Non-zero residual must map to **signed exception registry** rows (owner, reason, **expiry/revisit**, sign-off). |
| **Who signs near-zero acceptance** | Named role + person for “residual is acceptable.” |

Until these are set, legacy-rate gates stay **unknown pending telemetry**, not pass.

### 4. Policy decision matrix (required before 4K3)

| Decision topic | Question | Why it matters technically | Affected endpoints | Owner | Blocks 4K3 unless |
|---|---|---|---|---|---|
| `unresolved_manager_allow` | After backfill, may any manager with unresolved effective scope still `save_invoice`? Under what rule? | High-risk broad allow | `save_invoice` | Product + security | Written policy + migration/telemetry aligned |
| Scope vs `department` disagreement | Until cleanup, who wins if `department_scope` and `department` imply different outcomes? | `effectiveDepartmentScope` + legacy ORs → over-grant | all four command routes | Authz + product | Target behavior + evidence |
| Invoice vs confirm asymmetry | Keep asymmetric legacy category (`sales`+`accounting` vs `sales` only) through transition? | Evaluator asymmetry | `save_invoice`, `confirm_payment` | Product | Explicit parity contract |
| Temporary exceptions | Who may stay on legacy paths, for how long? | Unblocks cleanup without infinite waiver | all | Product + exec sponsor | **Exception registry** with mandatory fields |

#### Temporary exception registry — mandatory fields

No **pass** on a legacy-removal gate may rely on informal waivers. Each exception row must include:

| Field | Requirement |
|---|---|
| **Owner** | Accountable person for renewal/removal (not “team” only). |
| **Reason** | Why this subject is outside canonical-only rule. |
| **Expiry or revisit date** | Hard end **or** mandatory review date — **no** open-ended “temporary.” Extensions = **new** dated approval row. |
| **Scope of exception** | Subject class (e.g. role bucket, opaque id in secure registry — avoid PII in logs). |
| **Sign-off** | Approver name + date (ties to near-zero acceptance). |

Rows **without** expiry/revisit **cannot** support a gate **pass**.

### 5. Evidence ownership map (missing proof → owner → artifact)

| Proof item | Owner | Evidence source | Required artifact | Blocker type |
|---|---|---|---|---|
| Legacy branch rates | Platform/SRE or backend | Log drain / metrics | Dashboard + summary CSV/window | telemetry/data evidence |
| Deny baseline | Same | Same | Table per `permission` | telemetry/data evidence |
| Disagreement quantification | Data/DB + authz | DB query or approved extension | One-pager: query + counts | telemetry/data evidence |
| Unresolved manager policy | Product | Decision meeting | Signed excerpt / annex | policy/product |
| Invoice/confirm parity | Product | Decision | Matrix in doc annex | policy/product |
| Exception registry | Product + eng | Ticket/doc system | Rows with owner, reason, expiry, sign-off | policy/product |

### 6. Checkpoint split (4K2.5a–c; optional 4K2.5d)

| Subphase | Goal | Why first | Risk reduced | Unlocks |
|---|---|---|---|---|
| **4K2.5a** | Telemetry readiness: flag on staging/prod, ingest confirmed, metric defs | No ingest → no trustworthy rates | False zero from silence | 4K2.5b |
| **4K2.5b** | Draft thresholds + first full window; set **near-zero** numbers with data | Needs real volumes | Bad thresholds before seasonality | 4K2.5c |
| **4K2.5c** | Policy sign-off + **4K3 go/no-go** record | Data before policy commit | 4K3 with vague exceptions | 4K3 planning (destructive) only if gates pass/waived |
| **4K2.5d (optional)** | Safe observability for disagreement class | Only if DB path insufficient | — | Richer telemetry |

### 7. 4K3 go/no-go record format (template)

Use one row per gate:

| Gate ID | Status | Evidence level | Evidence link / artifact | Owner | Date | Notes |
|---|---|---|---|---|---|---|
| G-legacy-dept | `pass` / `fail` / `unknown pending telemetry` / `waived` | code-only / telemetry-backed / unknown | | | | Near-zero bound + registry refs |
| G-legacy-cat | same | same | | | | |
| G-unresolved-mgr | same | same | | | | Policy annex required for pass |
| G-denied-baseline | same | same | | | | Includes assert-only caveat |
| G-disagreement | same | same | | | | DB or 4K2.5d |
| G-track-d-seq | same | same | | | | Track D after Track C destructive |

### 8. Verification (this documentation pass)

- **Authorization behavior:** unchanged by this Phase 4K2.5 doc update alone.
- **Build:** run `npm run build` after doc edit to confirm repo health.
- **4K3 readiness after checkpoint:** remains **no** until 4K2.5a–c produces telemetry-backed evidence and signed policy/registry as defined above.

### 9. Risks / false-positive traps

- **`denied` under-counting** if failures happen before `assertCan*`.
- **Merging `super_manager` and `full_scope_allow`** in dashboards misstates “canonical” traffic.
- **`department_scope` log field alone** can miss disagreement where legacy `department` maps into effective scope.
- **Low traffic:** percentage thresholds noisy — use minimum counts.
- **Staging-only approval** for 4K3 without prod evidence or explicit waiver.

### 10. Execution order (operational)

1. Confirm aggregation for `[authz-branch]` when `PERMISSION_BRANCH_TELEMETRY=1`.
2. Run **4K2.5a** collection in agreed environments.
3. **4K2.5b:** fill near-zero bounds, exception registry template with real rows if needed.
4. **4K2.5c:** complete policy matrix + go/no-go table; only then schedule **4K3** destructive work.

### Phase 4K2.5a — Telemetry readiness and first-window collection

4K2.5a is **operational readiness + documentation** for branch telemetry. It does **not** change authorization behavior, permission semantics, or API responses. Optional log-field extensions remain **out of scope** unless approved as a separate non-auth-changing change.

**Execution tightenings (must appear in the final 4K2.5a execution report as well as this doc):**

1. **Enablement ownership** — record explicitly: who enables `PERMISSION_BRANCH_TELEMETRY`, **which environment is enabled first**, who validates ingest (filled names/dates).
2. **Healthy collection start** — collection is healthy only if **at least one** expected permission path emits events in the selected environment **or** absence is **explicitly** explained by low traffic (signed), not confused with broken telemetry.
3. **Mandatory one-liner in final report:** **Logged `scope` is raw `department_scope` only, not `effectiveDepartmentScope`.**

**Scope semantics (repeat):** Logged `scope` is raw `profiles.department_scope` only, not `effectiveDepartmentScope(profile)` from [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts). Do not interpret log `scope` as the scope used inside evaluators.

#### Repository evidence (code baseline)

- Tags/decisions: [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts) — `evaluateCreateOffersServerDecision`, `evaluateSaveInvoiceServerDecision`, `evaluateConfirmPaymentServerDecision`.
- Emission: [api/_lib/command-auth.ts](api/_lib/command-auth.ts) — `assertCanCreateOffers`, `assertCanSaveInvoice`, `assertCanConfirmPayment`; logs **after** evaluate, **before** deny throw when `PERMISSION_BRANCH_TELEMETRY === '1'`.
- Endpoints: [api/commands/create-direct-booking.ts](api/commands/create-direct-booking.ts), [api/commands/create-multi-offer.ts](api/commands/create-multi-offer.ts) → `create_offers`; [api/commands/save-invoice.ts](api/commands/save-invoice.ts) → `save_invoice`; [api/commands/confirm-payment.ts](api/commands/confirm-payment.ts) → `confirm_payment`.

#### Telemetry readiness audit

| Capability | Ready now (ops, once env+ingest) | Blocker if no | Evidence level |
|---|---|---|---|
| Tags emitted at assert boundary | yes | Flag off; wrong deployment | code-only → telemetry-backed after collection |
| Log shape `[authz-branch]` + `{ permission, tag, role, scope }` | yes | — | code-only |
| All three permission values covered | yes (four HTTP routes, two share `create_offers`) | — | code-only |
| Denied tag at assert | yes | — | code-only |
| Full picture of all HTTP 403/401 failures | **no** | Fails before `assertCan*` do not emit | code-only |
| Tag × permission counts | yes | Ingest not wired | telemetry-backed |
| Tag × permission × role | yes | — | telemetry-backed |
| Tag × permission × scope bucket | **partial** | Bucket is **raw `department_scope` only, not `effectiveDepartmentScope`** | code-only |
| Scope-vs-`department` disagreement rate | **no** | No `department` / no effective scope / no disagreement class in logs | code-only |
| **`scope` semantics clarity** | **N/A** | — | **Logged `scope` is raw `department_scope` only, not `effectiveDepartmentScope`.** |

#### Enablement ownership (fill before production-style reliance)

| Role | Responsibility |
|---|---|
| **Who enables `PERMISSION_BRANCH_TELEMETRY`** | Name + role (Platform/DevOps or deploy owner). |
| **Which environment is enabled first** | Default: **staging first**; document actual first env + date. Production required before 4K3 go/no-go per Phase 4K2.5. |
| **Who validates ingest** | Name + role; confirms log queries return `[authz-branch]` from the intended project/service. |

#### First-window collection runbook

1. Enablement owner sets `PERMISSION_BRANCH_TELEMETRY=1` on the deployment serving `/api/commands/*` (staging first by default).
2. Redeploy/restart so runtime picks up the variable.
3. **Smoke:** authenticated calls (or staging tests) so each of `create_offers`, `save_invoice`, `confirm_payment` can produce at least one line in the log sink where applicable.

#### Phase 4K2.5a — Operational execution package (repo-specific, copy-paste)

This subsection turns the checkpoint into **concrete operator steps**. It does **not** claim telemetry is enabled or that logs were collected in this repository—only what the codebase does when the flag is set.

**Deployment assumption (from repo):** The [vercel.json](vercel.json) file configures Vercel rewrites and lists **serverless functions** for the four command handlers. Treat **`PERMISSION_BRANCH_TELEMETRY`** as a **server-side (Vercel)** environment variable on the project that deploys this repo. If you deploy elsewhere (Docker, other host), map the same variable name to that runtime’s configuration—**this doc does not verify your live hosting**.

##### A. Behavior confirmed from code (no live telemetry claim)

| Item | Fact |
|---|---|
| **Emission site** | [api/_lib/command-auth.ts](api/_lib/command-auth.ts) only — inside `assertCanCreateOffers`, `assertCanSaveInvoice`, `assertCanConfirmPayment`. |
| **Order** | Each function calls `evaluate*ServerDecision(profile)`, then if telemetry is on logs **once**, then throws `403` if `!decision.allowed`. Denies **do** emit a line (with `tag: 'denied'`) before the throw. |
| **Env variable** | **`PERMISSION_BRANCH_TELEMETRY`** must equal the string **`1`** at Node process start: `process.env.PERMISSION_BRANCH_TELEMETRY === '1'` ([api/_lib/command-auth.ts](api/_lib/command-auth.ts) line 12). |
| **Marker** | First argument to `console.log`: **`[authz-branch]`** (literal). |
| **Payload** | Second argument: object with **`permission`**, **`tag`**, **`role`**, **`scope`**. |
| **`permission` values** | `'create_offers'` \| `'save_invoice'` \| `'confirm_payment'` (fixed per assert). |
| **`tag` values** | From [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts) type `PermissionBranchTag`: `super_manager`, `full_scope_allow`, `canonical_scope_allow`, `legacy_department_allow`, `legacy_category_access_allow`, `unresolved_manager_allow` (**save-invoice only**), `denied`. **confirm-payment** evaluator has **no** `unresolved_manager_allow` branch. |
| **`role`** | `profile.role` (string from DB, default normalized in loader). |
| **`scope`** | **`profile.department_scope ?? 'null'`** — raw `profiles.department_scope` column or sentinel `'null'`. **Not** `effectiveDepartmentScope(profile)`. |
| **Endpoints → assert** | `POST` [api/commands/create-direct-booking.ts](api/commands/create-direct-booking.ts) → `assertCanCreateOffers`; [api/commands/create-multi-offer.ts](api/commands/create-multi-offer.ts) → same; [api/commands/save-invoice.ts](api/commands/save-invoice.ts) → `assertCanSaveInvoice`; [api/commands/confirm-payment.ts](api/commands/confirm-payment.ts) → `assertCanConfirmPayment`. |
| **HTTP paths (Vercel)** | `/api/commands/create-direct-booking`, `/api/commands/create-multi-offer`, `/api/commands/save-invoice`, `/api/commands/confirm-payment` (matching `api/commands/*.ts` layout). |
| **`denied` coverage** | **Partial globally:** `[authz-branch]` appears only when the request reaches `assertCan*`. **No** emission for: missing/invalid bearer (`401`), profile missing/inactive (`403`) inside `requireCommandProfile`, or validation/body errors that occur **before** the assert in a given handler. For the four listed handlers, assert runs **immediately after** `requireCommandProfile` and **before** idempotency/body checks, so a **minimal authenticated POST** can still emit telemetry even when the API returns `400` later (e.g. missing `X-Idempotency-Key`). |

##### B. Operator runbook (outside the repo)

1. **Choose environment first** (recommended: **Preview/staging** Vercel environment before Production). Record which one in the evidence pack.
2. **Set variable** in Vercel: Project → **Settings** → **Environment Variables** → add **`PERMISSION_BRANCH_TELEMETRY`** = **`1`**, scoped to the intended environment(s) (e.g. Preview only, or Production when ready).
3. **Redeploy** the latest deployment (or trigger a new deployment) so every **new** serverless invocation **loads** the updated env. *Changing env without a new deployment can be unreliable; treat redeploy as required.*
4. **Confirm target:** the project that serves **`/api/commands/*`** for your staging/prod hostname (same Git repo; [vercel.json](vercel.json) references the four function paths).
5. **Validate ingest:** open **Vercel** → project → **Logs** (or your log drain destination: Datadog, Axiom, etc.) for that deployment/environment.
6. **Smoke-test** (see checklist below). **Success:** at least one log line contains **`[authz-branch]`** with `permission` in `{ create_offers, save_invoice, confirm_payment }` after a deliberate test request.
7. **Record evidence** using the template at the end of this subsection.

**What “working” looks like:** A line matching the filter **`[authz-branch]`** with JSON/object fields **`permission`**, **`tag`**, **`role`**, **`scope`** consistent with the test user’s profile (role and raw `department_scope`).

**Distinguish “no traffic” from “misconfigured”:**

| Situation | What to check |
|---|---|
| Suspect **flag off** or wrong project | Env UI shows `PERMISSION_BRANCH_TELEMETRY=1` on **this** project and environment; deployment **time is after** the change. |
| Suspect **wrong log stream** | Logs filtered by the **same** deployment URL / project / env you tested. |
| **Confirmed wiring** but **zero** events | Issue **one** intentional authenticated `POST` to any command path below, then re-query. If still zero, verify **function logs** (not only Edge). |
| **True low traffic** | Document window, environment, and **signed** confirmation that ingest + flag were verified with a **forced** smoke request (so silence is not confused with broken telemetry). |

##### C. Smoke-test checklist (initial burn-in)

Base URL: `https://<your-deployment-host>` (staging first). All routes **`POST`**, header **`Authorization: Bearer <valid JWT>`** for a user that exists and is active in `profiles`.

| # | HTTP path | Source file | Assert | Reachable `tag` values (from evaluators) | Minimal smoke | Expected telemetry line |
|---:|---|---|---|---|---|---|
| 1 | `/api/commands/create-direct-booking` | [api/commands/create-direct-booking.ts](api/commands/create-direct-booking.ts) | `assertCanCreateOffers` | `super_manager`, `full_scope_allow`, `canonical_scope_allow`, `legacy_department_allow`, `legacy_category_access_allow`, `denied` | **One** `POST` after auth is enough **for emission**: e.g. empty JSON body `{}` may still yield `400` later, but assert already ran. Optional: omit idempotency key to fail fast after log. | `{ permission: 'create_offers', tag: '<one-of-above>', role: '...', scope: '...' \| 'null' }` |
| 2 | `/api/commands/create-multi-offer` | [api/commands/create-multi-offer.ts](api/commands/create-multi-offer.ts) | `assertCanCreateOffers` | same as row 1 | Same as row 1. | Same `permission: 'create_offers'` (second route shares permission name). |
| 3 | `/api/commands/save-invoice` | [api/commands/save-invoice.ts](api/commands/save-invoice.ts) | `assertCanSaveInvoice` | Same tags as create-offers **plus** `unresolved_manager_allow` (manager + null effective scope per [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts)). | One authenticated `POST` (JSON or multipart path hits assert first). | `{ permission: 'save_invoice', ... }` |
| 4 | `/api/commands/confirm-payment` | [api/commands/confirm-payment.ts](api/commands/confirm-payment.ts) | `assertCanConfirmPayment` | Same as row 1 **except** **no** `unresolved_manager_allow` | One authenticated `POST`; handler may return `400` for bad `content-type` **after** assert — telemetry still emitted when assert runs. | `{ permission: 'confirm_payment', ... }` |

**Coverage note:** Two routes emit **`permission: 'create_offers'`**; you need **at least one** of them for legacy volume, not necessarily both, for health checks. For a **full** path smoke, hit one create-offers route + save-invoice + confirm-payment.

##### D. Log verification (exact filter text)

- **Contains (case-sensitive):** `[authz-branch]`
- **Optional refinement:** also match `create_offers` OR `save_invoice` OR `confirm_payment` depending on slice.

**Redacted example shape (illustrative only):**

```text
[authz-branch] { permission: 'save_invoice', tag: 'canonical_scope_allow', role: 'manager', scope: 'sales' }
```

Do not treat `scope` as `effectiveDepartmentScope` in reports: **Logged `scope` is raw `department_scope` only, not `effectiveDepartmentScope`.**

##### E. Healthy collection start (operator checklist)

- [ ] **`PERMISSION_BRANCH_TELEMETRY=1`** set for the intended Vercel environment.
- [ ] **Redeploy** completed after setting the variable.
- [ ] **Log sink** shows runtime logs for this project/deployment.
- [ ] **At least one** `[authz-branch]` event with `permission` in `create_offers` | `save_invoice` | `confirm_payment` after a deliberate smoke **or** **signed** low-traffic exception documenting forced smoke and ingest verification.

##### F. First evidence pack (copy-paste template)

```text
## Phase 4K2.5a — Evidence pack (fill after enablement)

- Environment (Vercel env / hostname): 
- Date/time telemetry enabled (UTC): 
- Who enabled (name, role): 
- Who validated ingest (name, role): 
- Redeploy / deployment ID or URL: 
- Log platform + link (if applicable): 
- Exact query / filter used: [authz-branch]
- Sample lines (2–5, redact tokens/ids if adjacent in stream):
  
- Endpoints smoke-tested: [ ] create-direct-booking [ ] create-multi-offer [ ] save-invoice [ ] confirm-payment
- Permissions observed in logs: [ ] create_offers [ ] save_invoice [ ] confirm_payment
- Healthy start: [ ] pass (≥1 permission path)  [ ] signed low-traffic exception (attach)
- Open gaps (e.g. prod not yet enabled): 
- Next review date / window end: 

Mandatory one-liner for final report:
Logged `scope` is raw `department_scope` only, not `effectiveDepartmentScope`.
```

##### G. Scope statement for this doc change

- **No** authorization behavior changes are made by adding this subsection.
- **No** claim that telemetry was enabled or logs collected **in CI or in this repo** — only operators can complete enablement on Vercel (or equivalent).
4. **Healthy collection start rule:** Collection is **healthy** only if **at least one** of `create_offers`, `save_invoice`, or `confirm_payment` emits `[authz-branch]` in the chosen environment during burn-in **or** zero events is **explicitly** documented as low/no traffic with **sign-off** that flag wiring and ingest are correct (not silent misconfiguration).
5. **Review window (proposed):** e.g. 7–14 calendar days; align with invoice/business cycle (exact span: owner).
6. **Minimum sample:** floor per cell TBD in 4K2.5b after first histogram; 4K2.5a captures data and produces first slices.
7. **End-of-window evidence pack:** aggregation exports, 3–5 redacted log lines, ingest link, date range, environment name(s).

**Final 4K2.5a execution report must include:** filled ownership table; healthy-start verdict; one-liner **Logged `scope` is raw `department_scope` only, not `effectiveDepartmentScope`.**

#### Aggregation / report format (first window)

| Slice | Dimensions | Why it matters | Informs gate | Telemetry sufficient? |
|---|---|---|---|---|
| A | `permission` × `tag` | Legacy vs canonical volume | G-legacy-dept, G-legacy-cat | yes |
| B | `permission` × `tag` × `role` | Role-driven legacy | Same + policy | yes |
| C | `permission` × `tag` × `scope_bucket` | **Bucket = raw log `scope` = raw `department_scope` only (not `effectiveDepartmentScope`)** | Segmentation | yes, with caveat |
| D | `tag=denied` by permission/role/bucket | Assert-time deny baseline | G-denied-baseline | yes (assert-only) |
| E | Legacy reliance index | Near-zero discussion | 4K2.5b thresholds | yes (denominator documented) |
| F | Anomaly list (top cells, spikes) | Investigate before 4K2.5b | Threshold tuning | yes; root cause may need DB |

Disagreement-rate slice: **not** from telemetry alone — use DB analytics or optional 4K2.5d (approved separately).

#### Disagreement evidence gap

| Question | Answer |
|---|---|
| Can telemetry alone prove `department_scope` vs `department` disagreement rates? | **No** |
| Preferred evidence | **DB analytics** on `profiles` (primary); optional env-gated non-PII log fields — separate approval |
| Owner | Data/DB + authz; platform if log extension |
| Blocks 4K2.5a? | **No** for tag/role/legacy/denied counts. Blocks closing disagreement-centric gates until 4K2.5b–c or parallel DB work. |

#### Safe observability extension (optional)

- **Default:** doc + runbook + env + ingest + templates only — **no** code change in 4K2.5a.
- **Optional follow-up:** coarse derived fields, env-gated, no PII, no auth change — **separate PR** and security sign-off; not required to mark 4K2.5a “ready to collect.”

#### Handoff checklist for 4K2.5b (outputs 4K2.5a must produce)

- [ ] Filled **enablement ownership** (who enabled, first environment + date, who validated ingest).
- [ ] **Telemetry enabled** confirmation (service/project, date).
- [ ] **Healthy collection start** pass or signed low-traffic explanation.
- [ ] **Ingest proof** (platform link + filter for `[authz-branch]`).
- [ ] **Redacted** sample lines (2–5).
- [ ] **Window** dates + environment(s).
- [ ] Saved **query/dashboard template** for slices A–D.
- [ ] First **summary tables** A–E (or “window in progress”).
- [ ] **Open gap** documented: disagreement path = DB or optional extension, owner assigned.
- [ ] **Denied caveat:** assert-only visibility documented.
- [ ] Final report includes: **Logged `scope` is raw `department_scope` only, not `effectiveDepartmentScope`.**

#### 4K2.5a verification (this implementation)

- After doc update: `npm run build`.
- **No** changes to [api/_lib/command-auth.ts](api/_lib/command-auth.ts) or [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts) in this doc-only 4K2.5a pass.

#### Risks / traps (4K2.5a)

- **Silent flag:** zero events misread as zero legacy usage.
- **`denied` under-count** when failures occur before `assertCan*`.
- **Scope bucket:** again — **Logged `scope` is raw `department_scope` only, not `effectiveDepartmentScope`.**
- **Staging silence:** use healthy-start rule + signed explanation if needed.

## Phase 4K2.5b — First telemetry window review and threshold draft

This phase is **documentation-only** and formalizes first-window review structure after healthy telemetry start. It does not modify auth logic, telemetry emission, command-auth contract, or endpoint behavior.

### 1) First-window review framing (facts vs expectations vs unknowns)

**Observed facts (telemetry-backed, runtime evidence):**

- `PERMISSION_BRANCH_TELEMETRY` enablement and healthy-start were confirmed operationally (outside repo).
- `[authz-branch]` events were observed for `create_offers`, `save_invoice`, and `confirm_payment`.
- Smoke evidence included `super_manager`-tagged events.

**Code-derived expectations (not yet fully quantified by window data):**

- Event shape remains `[authz-branch]` with `{ permission, tag, role, scope }` from [api/_lib/command-auth.ts](api/_lib/command-auth.ts).
- `scope` is raw `profiles.department_scope` (or `'null'`), not `effectiveDepartmentScope(profile)`.
- Tag universe follows [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts) evaluators.

**Unknowns pending more volume/time:**

- Stable percentages for legacy tags by permission and role.
- Representative denied baseline beyond smoke.
- Whether observed low legacy usage is durable across business-cycle traffic.
- Scope-vs-legacy disagreement rate (requires DB analytics and/or approved extension).

### 2) Telemetry review table (first-window staging/prod review format)

| permission | tag | observed count | evidence source | interpretation | gate relevance |
|---|---|---:|---|---|---|
| `create_offers` | `super_manager` | observed in smoke | telemetry runtime logs (`[authz-branch]`) | Telemetry path active for offers flow; role-heavy smoke traffic expected | baseline only; not near-zero proof |
| `save_invoice` | `super_manager` | observed in smoke | telemetry runtime logs (`[authz-branch]`) | Telemetry path active for invoice save flow | baseline only; not threshold pass |
| `confirm_payment` | `super_manager` | observed in smoke | telemetry runtime logs (`[authz-branch]`) | Telemetry path active for confirm flow | baseline only; not threshold pass |
| `create_offers` | `canonical_scope_allow` | TBD | pending first-window aggregates | Needed for canonical-vs-legacy ratio | G-legacy-dept/G-legacy-cat |
| `save_invoice` | `canonical_scope_allow` | TBD | pending first-window aggregates | Canonical adoption in invoice path | G-legacy-dept/G-legacy-cat |
| `confirm_payment` | `canonical_scope_allow` | TBD | pending first-window aggregates | Canonical adoption in confirm path | G-legacy-dept/G-legacy-cat |
| `*` | `legacy_department_allow` | TBD | pending first-window aggregates | Legacy dependency indicator | G-legacy-dept |
| `*` | `legacy_category_access_allow` | TBD | pending first-window aggregates | Legacy category fallback indicator | G-legacy-cat |
| `save_invoice` | `unresolved_manager_allow` | TBD | pending first-window aggregates | Transitional manager/null-scope reliance | policy + sequencing |
| `*` | `denied` | TBD | pending first-window aggregates | Assert-time deny baseline only (not all auth failures) | G-denied-baseline |

### 3) Threshold-draft table (provisional, for 4K2.5c sign-off prep)

| Tag | Proposed metric definition | Current evidence level | Provisional threshold style | Owner | Can support 4K3 yet |
|---|---|---|---|---|---|
| `legacy_department_allow` | `% of events for each permission where tag=legacy_department_allow` | code-ready + telemetry-enabled; counts pending | near-zero target with minimum denominator per permission | authz lead + product/security policy | no |
| `legacy_category_access_allow` | `% of events for each permission where tag=legacy_category_access_allow` | code-ready + telemetry-enabled; counts pending | stricter near-zero target than department fallback | authz lead + product/security policy | no |
| `unresolved_manager_allow` | `% within `save_invoice` where tag=unresolved_manager_allow` | code-ready + telemetry-enabled; counts pending | explicit cap + exception register requirement | finance flow owner + authz lead | no |
| `denied` | rate of assert-time denies per permission/role/scope bucket | partial coverage by design | baseline band (monitor drift, not absolute reject KPI) | API owner + SRE | no |
| `canonical_scope_allow` | share of canonical allows by permission | code-ready + telemetry-enabled; counts pending | should dominate non-super-manager allows | authz lead | no |
| `full_scope_allow` | share where full/all scope grants access | code-ready + telemetry-enabled; counts pending | bounded expected range by org role model | authz lead + policy owner | no |
| `super_manager` | share where super-manager branch used | telemetry-backed smoke only + pending window counts | expected low/known admin baseline | platform admin owner | no |

### 4) Near-zero formalization (required before 4K3)

- "Near-zero" must be converted from narrative to **numeric bounds** per gate and denominator definition.
- Current values are **provisional** until sufficient first-window volume exists (permission-level minima required).
- Pass/fail remains **unknown** until runtime aggregates satisfy sample and stability requirements.
- Any threshold override requires documented rationale, approver, and expiry/review date.

### 5) 4K3 blocker table (typed)

| Blocker type | Blocker | Current status | Exit criterion |
|---|---|---|---|
| telemetry/data evidence blocker | First-window aggregate counts by permission×tag×role×scope not yet documented as finalized | open | publish reviewed A-F summaries with denominator notes |
| telemetry/data evidence blocker | `denied` interpretation incomplete for non-assert failures | open | keep explicit caveat + do not use as global auth-failure metric |
| telemetry/data evidence blocker | disagreement rate (`department_scope` vs legacy `department`) not proven from logs | open | DB analytics result (or approved separate extension) attached |
| policy blocker | numeric near-zero thresholds not approved by policy owners | open | signed threshold table (owners + date) |
| policy blocker | exception governance (who can approve temporary legacy exceedance) not finalized | open | approved exception workflow with SLA and sunset |
| technical sequencing blocker | 4K2.5c sign-offs and go/no-go packet not complete | open | 4K2.5c checklist complete, then authorize 4K3 planning |

### 6) 4K2.5c handoff (what must be attached)

Required policy sign-offs before go/no-go:

- Authz lead sign-off on numeric thresholds and interpretation caveats.
- Product/security (or equivalent governance owner) sign-off on acceptable residual legacy exposure.
- Platform/SRE sign-off on telemetry ingest reliability for the reviewed window.

Required evidence artifacts:

- Final first-window tables (A-F) with denominators, date range, and environment labels.
- Redacted representative `[authz-branch]` samples for each observed permission path.
- Threshold-draft table promoted to signed thresholds (or explicitly deferred with risk note).
- Open-gap statement for disagreement evidence path (DB analytics and owner/date).
- Final explicit line: **Logged `scope` is raw `department_scope` only, not `effectiveDepartmentScope`.**

4K3 readiness at this stage: **no** (blocked by evidence closure + policy sign-off + sequencing).

### Phase 4K2.5b — First telemetry window summary and blocker recording

This subsection records the current first-window snapshot as **documentation-only evidence accounting**. It does not change authorization behavior, telemetry emission, endpoint contracts, or Track C cleanup sequencing.

#### 1) Evidence snapshot

| signal | observed now | evidence type | notes |
|---|---|---|---|
| `create_offers` permission | yes | production log evidence | `[authz-branch]` observed in production logs |
| `save_invoice` permission | yes | production log evidence | `[authz-branch]` observed in production logs |
| `confirm_payment` permission | yes | production log evidence | `[authz-branch]` observed in production logs |
| `super_manager` tag | yes | production log evidence | observed in current production sample |
| `canonical_scope_allow` tag | yes | production log evidence | observed in current production sample |
| `legacy_department_allow` tag | not observed in current smoke/sample | not yet observed | non-observed is not evidence of absence |
| `legacy_category_access_allow` tag | not observed in current smoke/sample | not yet observed | non-observed is not evidence of absence |
| `unresolved_manager_allow` tag | not observed in current smoke/sample | not yet observed | only eligible on `save_invoice`; still requires broader window |
| `denied` tag | not observed in current smoke/sample | not yet observed | assert-time deny evidence still pending representative window |

#### 2) Manual scenario validation

| scenario | result | related permission path | notes |
|---|---|---|---|
| create offer | pass | `create_offers` | manual flow executed successfully |
| create multi-offer | pass | `create_offers` | manual flow executed successfully |
| send email | pass | `create_offers` related business flow | scenario validated; telemetry path covered by command flow checks |
| send proforma | pass | `save_invoice` | manual flow executed successfully |
| attach payment proof | pass | `confirm_payment` | manual flow executed successfully |
| confirm payment | pass | `confirm_payment` | manual flow executed successfully |
| add invoice | pass | `save_invoice` | manual flow executed successfully |
| upload invoice | pass | `save_invoice` | manual flow executed successfully |
| facility calendar task flows | pass | outside command telemetry core; adjacent operational path | verified as successful; does not by itself prove legacy-tag absence |

#### 3) Current limitations

- Current evidence is sufficient to prove telemetry is **live and healthy** in production.
- Current evidence is **not sufficient** to approve 4K3 destructive cleanup.
- Legacy branch absence is **not proven** by current sample.
- A longer collection window and/or additional evidence is still required before branch-removal decisions.

#### 4) 4K3 blocker restatement

| blocker | type | status | why still blocked |
|---|---|---|---|
| Missing legacy tag frequency evidence (`legacy_department_allow`, `legacy_category_access_allow`) | telemetry/data evidence blocker | open | current sample confirms live telemetry but not sustained low-frequency bounds |
| Missing denied baseline understanding | telemetry/data evidence blocker | open | `denied` not yet observed in representative window; assert-only caveat remains |
| `unresolved_manager_allow` policy decision | policy blocker | open | threshold/exception policy not finalized for invoice transitional path |
| Disagreement evidence gap (`department_scope` vs legacy `department`) | telemetry/data evidence blocker | open | cannot be concluded from current log fields alone |
| Track D dependency | technical sequencing blocker | open | Track D remains blocked until Track C destructive-closure evidence and policy gates are complete |

#### 5) Explicit verdict

- 4K2.5a operational telemetry start: **complete**.
- 4K2.5b current summary: **recorded**.
- 4K3 ready: **no**.

#### 6) Evidence discipline note

- Logged `scope` is raw `department_scope` only, not `effectiveDepartmentScope`.
- Non-observed tags in current logs must not be interpreted as zero usage.

#### 7) Phase 4K2.5 checkpoint status (current stop point)

| Item | Status | Note |
|---|---|---|
| 4K2.5a | completed | telemetry readiness + operational start confirmed |
| 4K2.5b | completed | first-window summary and blocker recording documented |
| 4K2.5c | deferred / not started | policy-signoff and go/no-go packet intentionally postponed |
| 4K3 readiness | no | destructive cleanup remains blocked |
| Track C overall | paused after telemetry checkpoint | intentional pause after 4K2.5b |

#### 8) Current checkpoint verdict (Track C pause decision)

- Telemetry wiring works for command auth branch logging in production.
- `[authz-branch]` branch logs are observable and manual scenario evidence exists.
- Current evidence remains insufficient for destructive cleanup decisions.
- Numeric thresholds and policy sign-offs are unresolved.
- Therefore, 4K3 remains blocked and must not be started from this checkpoint.

#### 9) Separation of evidence classes at pause boundary

**Observed facts (runtime-backed):**

- Production telemetry enablement and healthy branch-log visibility are confirmed.
- Observed permissions include `create_offers`, `save_invoice`, `confirm_payment`.
- Observed tags include `super_manager` and `canonical_scope_allow`.

**Code-derived expectations (not yet closure evidence):**

- Full tag universe and assert coverage as defined in [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts) and [api/_lib/command-auth.ts](api/_lib/command-auth.ts).
- `denied` remains assert-bound, not a global auth-failure metric.
- Logged `scope` remains raw `department_scope` only, not `effectiveDepartmentScope`.

**Unresolved blockers (prevent 4K3):**

- Legacy tag frequency evidence not yet sufficient for branch-removal safety.
- `denied` baseline interpretation still incomplete for non-assert failures.
- `unresolved_manager_allow` policy/exception handling is not signed off.
- Disagreement evidence gap (`department_scope` vs `department`) still open.

**Future requirements (explicitly deferred):**

- 4K2.5c policy sign-off and finalized go/no-go packet.
- 4K3 destructive Track C cleanup only after deliberate return and explicit approvals.

#### 10) Transition note (outside Track C priority)

- Next engineering priority is outside Track C at this checkpoint.
- Track C should remain paused until a deliberate return for 4K2.5c or 4K3 readiness work.
- Likely next product/debug priority: booking / offer / proforma hanging diagnosis.
