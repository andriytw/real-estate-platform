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

/** Minimal rule: managers always; workers only facility+general or accounting+general for the task's department. */
export function isWorkerAssignableByTaskDepartment(
  w: Worker,
  taskDepartment: 'facility' | 'accounting'
): boolean {
  if (w.role === 'super_manager' || w.role === 'manager') return true;
  if (w.role !== 'worker') return false;
  if (taskDepartment === 'facility') {
    return w.department === 'facility' || w.department === 'general';
  }
  return w.department === 'accounting' || w.department === 'general';
}
