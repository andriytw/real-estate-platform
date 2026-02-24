/**
 * Market availability: blocked property IDs = rows in public.bookings overlapping date range.
 * Blocking = bookings table only (no reservations/offers/invoices).
 * Overlap: start_date < selectedEnd AND end_date > selectedStart.
 * Always uses server API (no client Supabase) for RLS safety.
 */

const API_BLOCKED_BOOKINGS = '/api/market/blocked-bookings';

/**
 * Fetches property IDs that are blocked (have at least one booking overlapping the range).
 * Uses only GET /api/market/blocked-bookings (server-only).
 */
export async function fetchBlockedPropertyIds(fromISO: string, toISO: string): Promise<Set<string>> {
  const fromTrim = fromISO.trim().slice(0, 10);
  const toTrim = toISO.trim().slice(0, 10);
  if (!fromTrim || !toTrim || fromTrim >= toTrim) return new Set();

  const url = `${API_BLOCKED_BOOKINGS}?from=${encodeURIComponent(fromTrim)}&to=${encodeURIComponent(toTrim)}`;
  const res = await fetch(url);
  if (!res.ok) return new Set();
  const body = (await res.json()) as { property_ids?: string[] };
  const arr = body?.property_ids;
  if (!Array.isArray(arr)) return new Set();
  const ids = new Set<string>();
  arr.forEach((id: unknown) => {
    if (id != null && String(id).trim()) ids.add(String(id).trim());
  });
  return ids;
}
