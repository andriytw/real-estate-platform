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

**Item:** `workersService.getAll()` — `profiles.select('*')`

- **Where found:** [services/supabaseService.ts](services/supabaseService.ts) — `workersService.getAll` uses `.select('*').order('name', ...)`.
- **Why it still exists:** Assignee dropdowns, CSV, and admin views need many profile fields (`can_be_task_assignee`, names, scope, etc.) in one call.
- **Current risk:** Same as broad SELECT: any future RLS or column removal on `profiles` affects every assignee list. Payload size and accidental reliance on unused columns.
- **Cleanup recommendation:** Split “assignee picker” vs “full admin user list” selects if needed; document required columns per use case.
- **Preconditions:** Map all callers of `getAll()`; verify assignee filtering still matches [filterAssignableWorkers](components/kanban/assigneeUtils.ts) after any column change.

---

**Item:** `transformWorkerFromDB` — `categoryAccess` default array and `canManageUsers` super_manager bridge

- **Where found:** [services/supabaseService.ts](services/supabaseService.ts) — `categoryAccess` defaults to a full module list when DB value is not an array; `canManageUsers` is true if `can_manage_users === true` **or** `(can_manage_users == null && role === 'super_manager')`.
- **Why it still exists:** Backward compatibility for rows created before Pass 1 flags were consistently set; avoids locking super admins out of User Management if `can_manage_users` was never written.
- **Current risk:** Client-side inference can **diverge** from DB truth; `canManageUsers` in [lib/permissions.ts](lib/permissions.ts) is **only** `!!user?.canManageUsers` (no role check) — the bridge is entirely in the transform. Removing the bridge before backfilling DB breaks admin access for some rows.
- **Cleanup recommendation:** Backfill `can_manage_users` for all `super_manager` rows in DB; then remove the null-coalescing bridge; optionally tighten `categoryAccess` default when `department_scope` is fully populated.
- **Preconditions:** One-time SQL backfill verified; UserManagement smoke test; `can_manage_users` visible in admin UI for all super managers.

---

**Item:** `category_access` + unresolved `department_scope` — sidebar and server LEGACY branches

- **Where found:** [lib/permissions.ts](lib/permissions.ts) `canViewModule` (lines 75–87) when `effectiveDepartmentScope` is null; [api/_lib/server-permissions.ts](api/_lib/server-permissions.ts) (`hasSalesCategoryAccess`, `department === 'sales'`, etc.); DB [has_sales_category_access()](supabase/migrations/20260330100000_phase3b_step1_helpers_rpc_scope_first.sql) when `department_scope IS NULL`.
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
| `WorkerContext` `profiles.select('*')` | A | [contexts/WorkerContext.tsx](contexts/WorkerContext.tsx). |
| `workersService.getAll` `select('*')` | A | [services/supabaseService.ts](services/supabaseService.ts). |
| `worker_id` + `assigned_worker_id` + `assignee` | A | Transforms and [AccountDashboard](components/AccountDashboard.tsx) patch patterns. |
| `getCalendarEventAssigneeId` | A | Assignee UI alignment post–Phase 3 fix. |
| Kanban `localStorage` columns | A | [components/kanban/KanbanBoard.tsx](components/kanban/KanbanBoard.tsx). |
| DB `kanban_columns` / workers | U | Schema exists; no app client query found — validate if any edge function or SQL job uses them. |
| `task_chat_messages` | A | Core Facility chat. |
| `task_comments` | U / L? | Table in SQL; **no** TS usage — validate empty in prod before any drop. |
| Root `supabase/migration_*.sql` vs `migrations/` | T | Historical/manual; risk of confusion, not automatically “removable.” |

---

## 4. Highest-risk cleanup targets

1. **Narrowing `profiles` SELECT in the browser** ([contexts/WorkerContext.tsx](contexts/WorkerContext.tsx), [workersService.getAll](services/supabaseService.ts)) without updating [transformWorkerFromDB](services/supabaseService.ts) and every consumer — **breaks** defaults for `categoryAccess`, invite flows, and admin UIs.

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

## 6. Recommended cleanup sequence (Phase 4+)

Derived from dependencies (data before schema; read paths before column drops).

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

## 10. Final recommendation

**Next implementation phase after this audit:** prioritize **4A + 4B** together in spirit: **observability** for unresolved scopes and assignee column parity, plus a **narrow, explicit `profiles` column list** for the session worker load (pattern already used in [api/_lib/command-auth.ts](api/_lib/command-auth.ts)). That reduces coupling **without** removing legacy columns yet and unblocks safer **4D** (`category_access`) and **4C** (assignee unification) later.

Secondary priority: **document or fix Kanban vs DB drift** (`columnId` / `createdFrom` vs [transformCalendarEventToDB](services/supabaseService.ts)) so operators and engineers do not assume DB `column_id` / `created_from` are populated by the current client path.

---

*Document generated as Phase 4 planning deliverable. Update this file when cleanup milestones complete.*
