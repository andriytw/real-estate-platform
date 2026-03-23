# Access redesign — implementation plan (Pass 1 executed)

## Final policy corrections (pre-execution)

1. **Legacy `general`:** not auto-normalized to `all`. Unresolved transitional value — **no broad permissions** from `general`. Full access only via **`super_manager`** or explicit **`department_scope = all`**.

2. **Users UI:** **`department_scope`** is the **only** editable business access field. **`department`** / **`category_access`** are not parallel editors in Pass 1; `department` is updated only via the **sync rule** on save.

3. **Sync `department_scope` → legacy `department`:** documented in [`lib/profileDepartmentSync.ts`](../lib/profileDepartmentSync.ts). **`all`** and **`properties`** cannot be stored in legacy `department` (CHECK); **`all` → `facility`** sentinel, **`properties` → `sales`**.

4. **`api/_lib/command-auth.ts`:** **not modified** in Pass 1 (server command behavior unchanged).

5. **Pass 1 Users UI acceptance:** create/edit persists **role, department_scope, can_manage_users, can_be_task_assignee, is_active**; table displays them; legacy rows render with **unresolved/legacy** labels until scope is set.

## Pass 1 deliverables (implemented)

- Migration: [`supabase/migrations/20260329120000_profiles_access_model_columns.sql`](../supabase/migrations/20260329120000_profiles_access_model_columns.sql)
- Sync helper: [`lib/profileDepartmentSync.ts`](../lib/profileDepartmentSync.ts)
- Permissions: [`lib/permissions.ts`](../lib/permissions.ts) — `canViewModule`, `canAccessDepartment`, `canManageUsers`, `isEligibleTaskAssignee`, `effectiveDepartmentScope`
- Types + transform: [`types.ts`](../types.ts), `transformWorkerFromDB` + `usersService` in [`services/supabaseService.ts`](../services/supabaseService.ts)
- Context: [`contexts/WorkerContext.tsx`](../contexts/WorkerContext.tsx) uses `transformWorkerFromDB`
- Users UI: [`components/admin/UserManagement.tsx`](../components/admin/UserManagement.tsx)
- Sidebar: [`components/AccountDashboard.tsx`](../components/AccountDashboard.tsx)
- Assignee: [`components/AdminCalendar.tsx`](../components/AdminCalendar.tsx), [`components/kanban/assigneeUtils.ts`](../components/kanban/assigneeUtils.ts)
- Edge function (create profile fields): [`supabase/functions/invite-user/index.ts`](../supabase/functions/invite-user/index.ts)

## Next phases (not done)

- App/Navbar route guards, Kanban/TaskCreateModal assignee parity with `isEligibleTaskAssignee`
- Command auth / RLS alignment with `department_scope`
- Remove legacy `category_access` / duplicate semantics
