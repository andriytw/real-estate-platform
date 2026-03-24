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

export type PermissionBranchTag =
  | 'super_manager'
  | 'full_scope_allow'
  | 'canonical_scope_allow'
  | 'legacy_department_allow'
  | 'legacy_category_access_allow'
  | 'unresolved_manager_allow'
  | 'denied';

type PermissionDecision = {
  allowed: boolean;
  tag: PermissionBranchTag;
};

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

function isSuperManagerAllow(profile: CommandAuthProfile): boolean {
  return profile.role === 'super_manager';
}

function isFullScopeAllow(profile: CommandAuthProfile): boolean {
  return hasFullScopeAccess(profile);
}

function isCanonicalScopeAllowForOffers(scope: string | null): boolean {
  return scope === 'sales';
}

function isLegacyDepartmentAllowForOffers(profile: CommandAuthProfile): boolean {
  return profile.department === 'sales';
}

function isLegacyCategoryAllowForOffers(profile: CommandAuthProfile): boolean {
  return categoryAccessIncludesNormalizedToken(profile, 'sales');
}

function isCanonicalScopeAllowForInvoice(scope: string | null): boolean {
  return scope === 'accounting' || scope === 'sales';
}

function isLegacyDepartmentAllowForInvoice(profile: CommandAuthProfile): boolean {
  return profile.department === 'accounting' || profile.department === 'sales';
}

function isLegacyCategoryAllowForInvoice(profile: CommandAuthProfile): boolean {
  return (
    categoryAccessIncludesNormalizedToken(profile, 'sales') ||
    categoryAccessIncludesNormalizedToken(profile, 'accounting')
  );
}

function isUnresolvedManagerAllowForInvoice(profile: CommandAuthProfile, scope: string | null): boolean {
  return profile.role === 'manager' && scope == null;
}

function isCanonicalScopeAllowForConfirm(scope: string | null): boolean {
  return scope === 'accounting' || scope === 'sales';
}

function isLegacyDepartmentAllowForConfirm(profile: CommandAuthProfile): boolean {
  return profile.department === 'accounting' || profile.department === 'sales';
}

function isLegacyCategoryAllowForConfirm(profile: CommandAuthProfile): boolean {
  return categoryAccessIncludesNormalizedToken(profile, 'sales');
}

/**
 * Branch priority order (must remain exact for parity):
 * super_manager -> full_scope_allow -> canonical_scope_allow -> legacy_department_allow ->
 * legacy_category_access_allow -> unresolved_manager_allow -> denied
 */
export function evaluateCreateOffersServerDecision(profile: CommandAuthProfile): PermissionDecision {
  if (isSuperManagerAllow(profile)) return { allowed: true, tag: 'super_manager' };
  if (isFullScopeAllow(profile)) return { allowed: true, tag: 'full_scope_allow' };
  const scope = effectiveDepartmentScope(profile);
  if (isCanonicalScopeAllowForOffers(scope)) return { allowed: true, tag: 'canonical_scope_allow' };
  if (isLegacyDepartmentAllowForOffers(profile)) return { allowed: true, tag: 'legacy_department_allow' };
  if (isLegacyCategoryAllowForOffers(profile)) {
    return { allowed: true, tag: 'legacy_category_access_allow' };
  }
  return { allowed: false, tag: 'denied' };
}

/**
 * Branch priority order (must remain exact for parity):
 * super_manager -> full_scope_allow -> canonical_scope_allow -> legacy_department_allow ->
 * legacy_category_access_allow -> unresolved_manager_allow -> denied
 */
export function evaluateSaveInvoiceServerDecision(profile: CommandAuthProfile): PermissionDecision {
  if (isSuperManagerAllow(profile)) return { allowed: true, tag: 'super_manager' };
  if (isFullScopeAllow(profile)) return { allowed: true, tag: 'full_scope_allow' };
  const scope = effectiveDepartmentScope(profile);
  if (isCanonicalScopeAllowForInvoice(scope)) return { allowed: true, tag: 'canonical_scope_allow' };
  if (isLegacyDepartmentAllowForInvoice(profile)) return { allowed: true, tag: 'legacy_department_allow' };
  if (isLegacyCategoryAllowForInvoice(profile)) {
    return { allowed: true, tag: 'legacy_category_access_allow' };
  }
  if (isUnresolvedManagerAllowForInvoice(profile, scope)) {
    return { allowed: true, tag: 'unresolved_manager_allow' };
  }
  return { allowed: false, tag: 'denied' };
}

/**
 * Branch priority order (must remain exact for parity):
 * super_manager -> full_scope_allow -> canonical_scope_allow -> legacy_department_allow ->
 * legacy_category_access_allow -> denied
 */
export function evaluateConfirmPaymentServerDecision(profile: CommandAuthProfile): PermissionDecision {
  if (isSuperManagerAllow(profile)) return { allowed: true, tag: 'super_manager' };
  if (isFullScopeAllow(profile)) return { allowed: true, tag: 'full_scope_allow' };
  const scope = effectiveDepartmentScope(profile);
  if (isCanonicalScopeAllowForConfirm(scope)) return { allowed: true, tag: 'canonical_scope_allow' };
  if (isLegacyDepartmentAllowForConfirm(profile)) return { allowed: true, tag: 'legacy_department_allow' };
  if (isLegacyCategoryAllowForConfirm(profile)) {
    return { allowed: true, tag: 'legacy_category_access_allow' };
  }
  return { allowed: false, tag: 'denied' };
}

/**
 * Sales / offers / direct booking commands — align with UI sales module access.
 */
export function canCreateOffersServer(profile: CommandAuthProfile): boolean {
  return evaluateCreateOffersServerDecision(profile).allowed;
}

/**
 * Invoice / proforma writes — accounting + sales scopes; not blanket "any manager" when scope is known.
 */
export function canSaveInvoiceServer(profile: CommandAuthProfile): boolean {
  return evaluateSaveInvoiceServerDecision(profile).allowed;
}

/**
 * Confirm payment / mark paid — same gate as historical RPC: accounting, sales, super; not blanket manager.
 */
export function canConfirmPaymentServer(profile: CommandAuthProfile): boolean {
  return evaluateConfirmPaymentServerDecision(profile).allowed;
}
