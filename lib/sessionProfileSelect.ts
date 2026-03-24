/**
 * Session profile row: columns required for transformWorkerFromDB (services/supabaseService.ts).
 * Frozen for Phase 4B — keep in sync with Worker shape and transformWorkerFromDB reads only.
 */
export const SESSION_PROFILE_SELECT_COLUMNS =
  'id, first_name, last_name, name, email, phone, role, department, department_scope, is_active, category_access, can_manage_users, can_be_task_assignee, manager_id, last_invite_sent_at, created_at, updated_at' as const;

/**
 * Admin user-management profile row: derived from actual UserManagement usage
 * (list rendering + edit/create/invite/refetch flows) and transformWorkerFromDB compatibility.
 * Keep explicit to avoid hidden broad `profiles.select('*')` coupling.
 */
export const ADMIN_PROFILE_SELECT_COLUMNS =
  'id, first_name, last_name, name, email, phone, role, department, department_scope, is_active, category_access, can_manage_users, can_be_task_assignee, manager_id, last_invite_sent_at, created_at, updated_at' as const;

import type { Worker } from '../types';

/**
 * Phase 4A: dev-only, no PII — flags, null-state, counts for unresolved scope / access auditing.
 */
export function logDevSessionProfileObservability(worker: Worker): void {
  if (!import.meta.env.DEV || typeof window === 'undefined') return;
  console.info('[WorkerContext][sessionProfile]', {
    role: worker.role,
    isActive: worker.isActive,
    departmentScopeNull: worker.departmentScope == null,
    categoryAccessCount: Array.isArray(worker.categoryAccess) ? worker.categoryAccess.length : 0,
    canManageUsers: worker.canManageUsers,
    canBeTaskAssignee: worker.canBeTaskAssignee,
  });
}
