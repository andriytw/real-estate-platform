import { CalendarEvent, Worker } from '../../types';
import { isEligibleTaskAssignee as isEligibleTaskAssigneeFromPermissions } from '../../lib/permissions';

/** Re-export — use only in assignee dropdowns/selectors, not guards or module visibility. */
export const isEligibleTaskAssignee = isEligibleTaskAssigneeFromPermissions;

/** Assignee dropdowns only: global pool (is_active + can_be_task_assignee). */
export function filterAssignableWorkers(workers: Worker[]): Worker[] {
  return workers.filter(isEligibleTaskAssignee);
}

/** Same convention as list/CSV: prefer worker_id, then assigned_worker_id. */
export function getCalendarEventAssigneeId(
  event: Pick<CalendarEvent, 'workerId' | 'assignedWorkerId'>
): string {
  return event.workerId || event.assignedWorkerId || '';
}
