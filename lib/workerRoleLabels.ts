import type { Worker } from '../types';

/** Ukrainian display labels for DB role values (UI only; never persist). */
export function workerRoleLabelUk(role: Worker['role'] | string | undefined | null): string {
  switch (role) {
    case 'super_manager':
      return 'Супер-менеджер';
    case 'manager':
      return 'Менеджер';
    case 'worker':
      return 'Працівник';
    default:
      return role ? String(role) : '—';
  }
}

/** Role in parentheses, e.g. "(Менеджер)" — empty when role is missing. */
export function workerRoleParenUk(role: Worker['role'] | string | undefined | null): string {
  if (role == null || role === '') return '';
  return `(${workerRoleLabelUk(role)})`;
}
