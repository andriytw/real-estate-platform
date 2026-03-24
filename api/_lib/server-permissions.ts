/**
 * Server-side permission helpers for Vercel command API (Phase 3A).
 * Mirrors ideas from lib/permissions.ts without importing the client bundle.
 *
 * Primary: department_scope, can_manage_users
 * LEGACY fallback: department, category_access (transitional)
 *
 * can_be_task_assignee is NOT used for business command authorization.
 */

export type CommandAuthProfile = {
  id: string;
  role: string;
  department: string | null;
  /** From profiles.department_scope — primary scope for managers */
  department_scope: string | null;
  is_active: boolean | null;
  category_access: unknown;
  can_manage_users: boolean;
  can_be_task_assignee: boolean;
};

const VALID_SCOPES = new Set(['facility', 'accounting', 'sales', 'properties', 'all']);

/** Prefer department_scope; else map legacy department if facility|accounting|sales. */
export function effectiveDepartmentScope(profile: CommandAuthProfile): string | null {
  const raw = profile.department_scope;
  if (raw && VALID_SCOPES.has(raw)) return raw;
  const d = profile.department;
  if (d === 'facility' || d === 'accounting' || d === 'sales') return d;
  return null;
}

export function hasFullScopeAccess(profile: CommandAuthProfile): boolean {
  if (profile.role === 'super_manager') return true;
  return effectiveDepartmentScope(profile) === 'all';
}

export function canManageUsersServer(profile: CommandAuthProfile): boolean {
  return profile.can_manage_users === true;
}

/**
 * LEGACY: `profiles.category_access` array check — must preserve exact semantics from Phase 3A:
 * - null / non-array / missing → false
 * - match via `String(x).toLowerCase() === token` (same as prior `hasSalesCategoryAccess` / `hasAccountingCategoryAccess`)
 */
function categoryAccessIncludesNormalizedToken(
  profile: CommandAuthProfile,
  token: 'sales' | 'accounting'
): boolean {
  const ca = profile.category_access;
  if (!ca || !Array.isArray(ca)) return false;
  return ca.some((x) => String(x).toLowerCase() === token);
}

/**
 * Sales / offers / direct booking commands — align with UI sales module access.
 */
export function canCreateOffersServer(profile: CommandAuthProfile): boolean {
  if (profile.role === 'super_manager') return true;
  if (hasFullScopeAccess(profile)) return true;
  const scope = effectiveDepartmentScope(profile);
  if (scope === 'sales') return true;
  // LEGACY: department column
  if (profile.department === 'sales') return true;
  // LEGACY: category_access
  if (categoryAccessIncludesNormalizedToken(profile, 'sales')) return true;
  return false;
}

/**
 * Invoice / proforma writes — accounting + sales scopes; not blanket "any manager" when scope is known.
 */
export function canSaveInvoiceServer(profile: CommandAuthProfile): boolean {
  if (profile.role === 'super_manager') return true;
  if (hasFullScopeAccess(profile)) return true;
  const scope = effectiveDepartmentScope(profile);
  if (scope === 'accounting' || scope === 'sales') return true;
  // LEGACY: department
  if (profile.department === 'accounting' || profile.department === 'sales') return true;
  if (categoryAccessIncludesNormalizedToken(profile, 'sales')) return true;
  if (categoryAccessIncludesNormalizedToken(profile, 'accounting')) return true;
  /**
   * LEGACY: unresolved scope + manager — preserve prior broad allow (managers often elevated in prod).
   * Once department_scope is backfilled everywhere, consider removing this branch.
   */
  if (profile.role === 'manager' && scope == null) return true;
  return false;
}

/**
 * Confirm payment / mark paid — same gate as historical RPC: accounting, sales, super; not blanket manager.
 */
export function canConfirmPaymentServer(profile: CommandAuthProfile): boolean {
  if (profile.role === 'super_manager') return true;
  if (hasFullScopeAccess(profile)) return true;
  const scope = effectiveDepartmentScope(profile);
  if (scope === 'accounting' || scope === 'sales') return true;
  if (profile.department === 'accounting' || profile.department === 'sales') return true;
  if (categoryAccessIncludesNormalizedToken(profile, 'sales')) return true;
  return false;
}
