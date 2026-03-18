/**
 * One ID per full page load. After refresh, a new ID is generated — use in logs to prove tab-scoped behavior.
 */
export const PAGE_INSTANCE_ID =
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `page-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
