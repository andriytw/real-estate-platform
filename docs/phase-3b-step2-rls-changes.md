# Phase 3B — Step 2: policies changed (Approach B — final)

Migration: [`supabase/migrations/20260331120000_phase3b_step2_task_chat_profiles_rls.sql`](../supabase/migrations/20260331120000_phase3b_step2_task_chat_profiles_rls.sql)

Prerequisite: Step 1 — [`20260330100000_phase3b_step1_helpers_rpc_scope_first.sql`](../supabase/migrations/20260330100000_phase3b_step1_helpers_rpc_scope_first.sql).

## Approach B (locked)

| Area | Step 2 |
|------|--------|
| `profiles` **SELECT** | **Not changed** — no `DROP`/`CREATE` of SELECT policies in this migration. |
| `task_chat_messages` | **Changed** — scope-first helper + policy replace. |
| `profiles` **UPDATE** (others’ rows) | **Changed** — single policy: `super_manager` OR `current_can_manage_users()`. |
| Self-update | **Not modified** — existing `Users can update own profile` (if any) left as-is. Field-level anti-escalation → future trigger/task if needed. |

## Snapshot before apply

```sql
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('profiles', 'task_chat_messages')
ORDER BY tablename, policyname;
```

## New / replaced SQL objects

| Object | Role |
|--------|------|
| `can_access_task_chat_for_event(ce_department)` | SECURITY DEFINER; scope-first task chat gate |
| `coalesce_effective_scope` | Dropped if a draft had created it (`DROP FUNCTION IF EXISTS`) |

## `task_chat_messages`

| Policy | Action |
|--------|--------|
| `task_chat_messages_select_policy` | DROP + CREATE |
| `task_chat_messages_insert_policy` | DROP + CREATE |
| Legacy names (if present) | DROP IF EXISTS |

### Behavior (summary)

| Caller | Before | After |
|--------|--------|-------|
| Worker | `ce.worker_id = auth.uid()` | Same |
| Manager / super | Legacy `p.department` vs `ce.department` | Scope-first via `can_access_task_chat_for_event` + unresolved legacy branch |

## `profiles` — UPDATE only

### Dropped (IF EXISTS)

- `Super managers can update all profiles`
- `Managers can update profiles in department`
- `profiles_update_policy`
- `profiles_update_by_admin_capability_phase3b_v1` (idempotent re-run)

### Created

| Policy | Purpose |
|--------|---------|
| `profiles_update_by_admin_capability_phase3b_v1` | UPDATE rows where `auth.uid() <> id` and (`super_manager` OR `current_can_manage_users()`) |

### Not touched by this migration

- **All SELECT policies** on `profiles` (own row, managers view all, department view, etc.)
- **`Users can update own profile`** (if present) — not dropped; not recreated with new field checks
- **INSERT** policies (e.g. `Users can insert own profile`) if present

## Global assignee pool

Unchanged intent: assignee / operational worker lists ([`getAssignableWorkers()` / `getWorkerDirectory()`](../services/supabaseService.ts)) use the same `profiles` SELECT RLS as before; the app still filters with `isEligibleTaskAssignee`. User Management uses explicit admin profile reads ([`getAdminProfilesList()` / `getAdminProfileById()`](../services/supabaseService.ts)).

## Staging verification

- Assignee dropdowns: non-empty, same as pre–Step 2 for SELECT.
- User management: privileged user can update others; user without `can_manage_users` cannot update others’ rows (unless super, per policy).
- Task chat: worker + facility/accounting/super edge cases.
- Regression: RLS `42501` where expected.

## Rollback

Restore policy definitions from pre-migration snapshot; restore prior `can_access_task_chat_for_event` body from `pg_get_functiondef` if needed.
