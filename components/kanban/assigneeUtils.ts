import { Worker } from '../../types';

export const ASSIGNABLE_OPERATIONAL_ROLES: ReadonlySet<Worker['role']> = new Set([
  'worker',
  'manager',
  'super_manager',
]);

export function isAssignableOperationalUser(w: Worker): boolean {
  return w.isActive !== false && ASSIGNABLE_OPERATIONAL_ROLES.has(w.role);
}

export function filterAssignableWorkers(workers: Worker[]): Worker[] {
  return workers.filter(isAssignableOperationalUser);
}
