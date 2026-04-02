import type { Booking } from '../types';

export type IsoDate = string; // YYYY-MM-DD

export function normalizeIsoDate(d: string): IsoDate {
  return String(d || '').slice(0, 10) as IsoDate;
}

export function addDaysIso(iso: IsoDate, days: number): IsoDate {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Convert inclusive UI range [startIso, endIsoInclusive] to stored [startIso, endIsoExclusive]. */
export function inclusiveToExclusive(startIso: IsoDate, endIsoInclusive: IsoDate): { startIso: IsoDate; endIsoExclusive: IsoDate } {
  const a = normalizeIsoDate(startIso);
  const b = normalizeIsoDate(endIsoInclusive);
  const endIsoExclusive = addDaysIso(b, 1);
  return { startIso: a, endIsoExclusive };
}

export function rangesOverlapExclusive(aStart: IsoDate, aEndEx: IsoDate, bStart: IsoDate, bEndEx: IsoDate): boolean {
  const A0 = normalizeIsoDate(aStart);
  const A1 = normalizeIsoDate(aEndEx);
  const B0 = normalizeIsoDate(bStart);
  const B1 = normalizeIsoDate(bEndEx);
  return A0 < B1 && B0 < A1;
}

export function isIsoInExclusiveRange(dayIso: IsoDate, startIso: IsoDate, endIsoExclusive: IsoDate): boolean {
  const d = normalizeIsoDate(dayIso);
  const s = normalizeIsoDate(startIso);
  const e = normalizeIsoDate(endIsoExclusive);
  return s <= d && d < e;
}

export function isBlockBooking(b: Booking): boolean {
  return String(b.type || '').toUpperCase() === 'BLOCK';
}

/**
 * Half-open overlap with any BLOCK booking for this property.
 * Use for Sales guards and matrix OOO — same semantics as `rangesOverlapExclusive`.
 */
export function hasBlockOverlapForPropertyHalfOpen(
  propertyIdRaw: string | null | undefined,
  rangeStart: IsoDate,
  rangeEndExclusive: IsoDate,
  bookings: Booking[]
): boolean {
  const propertyId = String(propertyIdRaw ?? '').trim();
  if (!propertyId) return false;
  const start = normalizeIsoDate(rangeStart);
  const end = normalizeIsoDate(rangeEndExclusive);
  if (!start || !end || start >= end) return false;
  return bookings.some((b) => {
    if (String(b.propertyId ?? '') !== propertyId) return false;
    if (!isBlockBooking(b)) return false;
    const bs = normalizeIsoDate(String(b.start ?? ''));
    const be = normalizeIsoDate(String(b.end ?? ''));
    if (!bs || !be || bs >= be) return false;
    return rangesOverlapExclusive(start, end, bs, be);
  });
}

/** True if `dayIso` (calendar day) falls inside any BLOCK [start, end) for this property. */
export function isPropertyBlockActiveOnDate(propertyIdRaw: string | null | undefined, dayIso: IsoDate, bookings: Booking[]): boolean {
  const pid = String(propertyIdRaw ?? '').trim();
  if (!pid) return false;
  const d = normalizeIsoDate(dayIso);
  return bookings.some((b) => {
    if (String(b.propertyId ?? '') !== pid) return false;
    if (!isBlockBooking(b)) return false;
    const bs = normalizeIsoDate(String(b.start ?? ''));
    const be = normalizeIsoDate(String(b.end ?? ''));
    if (!bs || !be || bs >= be) return false;
    return isIsoInExclusiveRange(d, bs, be);
  });
}

export function blockBookingsForProperty(bookings: Booking[], propertyId: string): Booking[] {
  const pid = String(propertyId);
  return bookings.filter((b) => String(b.propertyId || '') === pid && isBlockBooking(b));
}

export function nonBlockBookingsForProperty(bookings: Booking[], propertyId: string): Booking[] {
  const pid = String(propertyId);
  return bookings.filter((b) => String(b.propertyId || '') === pid && !isBlockBooking(b));
}

