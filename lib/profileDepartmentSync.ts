/**
 * Legacy `profiles.department` is constrained (typically facility|accounting|sales) and is still used by RLS helpers.
 * `department_scope` is the editable business scope in the app (includes properties|all).
 *
 * ## Sync rule (on every save from Users UI / usersService)
 * When `department_scope` is set, always write mirrored `department` for RLS:
 *
 * | department_scope | profiles.department written |
 * |------------------|----------------------------|
 * | facility         | facility                   |
 * | accounting       | accounting                 |
 * | sales            | sales                      |
 * | properties       | sales                      |
 * | all              | facility (sentinel only — does NOT mean facility-only in app; full UI access is still `super_manager` OR explicit `department_scope = all` via permissions) |
 *
 * `department_scope = all` cannot be stored in `department` (CHECK); the sentinel keeps inserts valid.
 */

import type { DepartmentScope } from '../types';

const CHECK_SAFE: Record<DepartmentScope, 'facility' | 'accounting' | 'sales'> = {
  facility: 'facility',
  accounting: 'accounting',
  sales: 'sales',
  properties: 'sales',
  all: 'facility',
};

export function mirrorLegacyDepartmentFromScope(scope: DepartmentScope): 'facility' | 'accounting' | 'sales' {
  return CHECK_SAFE[scope] ?? 'facility';
}
