/**
 * Centralized permission helpers — Pass 1 (narrow).
 * Full access: only `role === 'super_manager'` OR explicit `department_scope === 'all'`.
 * Legacy `department === 'general'` is unresolved: does NOT grant modules or `all` behavior.
 */

import type { CategoryAccess, DepartmentScope, Worker } from '../types';

export type AppModule = 'properties' | 'facility' | 'accounting' | 'sales' | 'tasks' | 'admin';

const VALID_SCOPES = new Set<string>(['facility', 'accounting', 'sales', 'properties', 'all']);

/** Resolved from DB: prefer department_scope; else map legacy department if facility|accounting|sales; else null (unresolved). */
export function effectiveDepartmentScope(user: Worker | null | undefined): DepartmentScope | null {
  if (!user) return null;
  const raw = user.departmentScope;
  if (raw && VALID_SCOPES.has(raw)) return raw;
  const d = user.department;
  if (d === 'facility' || d === 'accounting' || d === 'sales') return d;
  return null;
}

function hasFullScopeAccess(user: Worker): boolean {
  if (user.role === 'super_manager') return true;
  return effectiveDepartmentScope(user) === 'all';
}

/** User-management capability (profiles UI, invites, etc.). */
export function canManageUsers(user: Worker | null | undefined): boolean {
  return !!user?.canManageUsers;
}

/** Task assignee dropdown eligibility (global pool: flag + active, no department filter). */
export function isEligibleTaskAssignee(user: Worker | null | undefined): boolean {
  if (!user || user.isActive === false) return false;
  return user.canBeTaskAssignee !== false;
}

/**
 * Sidebar / module tiles. Managers only see modules for their scope (Properties is NOT universal).
 * Unresolved scope (null): fall back to legacy category_access only for sidebar compatibility.
 */
export function canViewModule(user: Worker | null | undefined, module: AppModule): boolean {
  if (!user || user.isActive === false) return false;

  if (user.role === 'worker') {
    return false;
  }

  if (module === 'admin') {
    return canManageUsers(user);
  }

  if (user.role === 'super_manager' || hasFullScopeAccess(user)) {
    return true;
  }

  const scope = effectiveDepartmentScope(user);

  if (scope != null) {
    if (scope === 'all') return true;
    if (module === 'properties') return scope === 'properties';
    if (module === 'facility') return scope === 'facility';
    if (module === 'accounting') return scope === 'accounting';
    if (module === 'sales') return scope === 'sales';
    if (module === 'tasks') {
      return scope === 'facility' || scope === 'accounting' || scope === 'all';
    }
    return false;
  }

  // Unresolved legacy: category_access only (transitional)
  const ca = user.categoryAccess;
  if (!ca?.length) return false;
  const map: Record<AppModule, CategoryAccess | null> = {
    properties: 'properties',
    facility: 'facility',
    accounting: 'accounting',
    sales: 'sales',
    tasks: 'tasks',
    admin: null,
  };
  const key = map[module];
  return key != null && ca.includes(key);
}

/** Department chip / content filter (strict; no `general` magic). */
export function canAccessDepartment(
  user: Worker | null | undefined,
  department: 'facility' | 'accounting' | 'sales' | 'properties'
): boolean {
  if (!user || user.isActive === false) return false;
  if (user.role === 'super_manager' || hasFullScopeAccess(user)) return true;
  const scope = effectiveDepartmentScope(user);
  if (scope == null) return false;
  if (scope === 'all') return true;
  return scope === department;
}
