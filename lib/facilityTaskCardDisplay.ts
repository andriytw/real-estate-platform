import type { CalendarEvent, Property } from '../types';

/**
 * Primary line for Facility calendar tiles and Kanban facility cards:
 * task type label only (not "Unit — Type"). Subtitle stays address — unit elsewhere.
 */
export function getFacilityTaskPrimaryLine(
  event: CalendarEvent,
  property?: Property | null
): string {
  const typeStr = String(event.type ?? '').trim();
  if (typeStr && typeStr !== 'other') return typeStr;

  const unitTitle = (property?.title ?? '').trim();
  const eventTitle = (event.title ?? '').trim();
  if (unitTitle && eventTitle) {
    for (const sep of [' — ', ' - ']) {
      const prefix = unitTitle + sep;
      if (eventTitle.toLowerCase().startsWith(prefix.toLowerCase())) {
        const rest = eventTitle.slice(prefix.length).trim();
        if (rest) return rest;
      }
    }
  }
  return eventTitle || '—';
}
