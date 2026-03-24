import type { CalendarEvent } from '../types';

type AssigneeIdentityLike = Pick<CalendarEvent, 'workerId' | 'assignedWorkerId'>;
type AssigneeNameLike = Pick<CalendarEvent, 'workerId' | 'assignedWorkerId' | 'assignee'>;

/**
 * Canonical assignee id resolver for app logic.
 * Source of truth in compatibility mode: workerId first, assignedWorkerId fallback.
 */
export function getCalendarEventAssigneeId(event: AssigneeIdentityLike | null | undefined): string {
  if (!event) return '';
  return event.workerId || event.assignedWorkerId || '';
}

/**
 * Normalize assignee id for writes/patches.
 * Empty string/null/undefined are treated as clear (null).
 */
export function normalizeCalendarEventAssigneeId(input: {
  workerId?: string | null;
  assignedWorkerId?: string | null;
}): string | null {
  const candidate = input.workerId ?? input.assignedWorkerId;
  if (candidate == null) return null;
  const trimmed = String(candidate).trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Compatibility-safe assignee name resolver.
 * Prefers worker name by canonical id, then legacy assignee text fallback.
 */
export function getCalendarEventAssigneeName(
  event: AssigneeNameLike | null | undefined,
  getWorkerNameById?: (id: string) => string | undefined
): string {
  if (!event) return '';
  const assigneeId = getCalendarEventAssigneeId(event);
  const fromWorker = assigneeId ? getWorkerNameById?.(assigneeId) : undefined;
  if (fromWorker && fromWorker.trim().length > 0) return fromWorker;
  return (event.assignee ?? '').trim();
}
