import type { Booking, Property } from '../types';
import { formatLocalDateYmd } from './localDate';
import {
  addDaysIso,
  hasBlockOverlapForPropertyHalfOpen,
  isPropertyBlockActiveOnDate,
  normalizeIsoDate,
  type IsoDate,
} from './oooBlocks';

/** Single resolved date context for Sales left-list status + filter (must stay in sync). */
export type SalesStatusContext =
  | { kind: 'halfOpenRange'; startIso: IsoDate; endExclusiveIso: IsoDate }
  | { kind: 'singleDay'; dayIso: IsoDate };

/**
 * Priority: (1) availability start/end when both valid and start < end (half-open [start, end) like existing filter)
 * (2) visible calendar window [calendarFirstDay, calendarFirstDay + totalDays)
 * (3) today (local)
 */
export function resolveSalesStatusContext(params: {
  availabilityStartDate: string;
  availabilityEndDate: string;
  calendarStartDate: Date;
  totalDays: number;
}): SalesStatusContext {
  const a = String(params.availabilityStartDate ?? '').trim();
  const b = String(params.availabilityEndDate ?? '').trim();
  if (a && b) {
    const availabilityStart = normalizeIsoDate(a);
    const availabilityEnd = normalizeIsoDate(b);
    if (availabilityStart && availabilityEnd && availabilityStart < availabilityEnd) {
      return { kind: 'halfOpenRange', startIso: availabilityStart, endExclusiveIso: availabilityEnd };
    }
  }
  const td = Number(params.totalDays) || 0;
  if (td > 0) {
    const ymd = formatLocalDateYmd(params.calendarStartDate);
    const startIso = normalizeIsoDate(ymd);
    const endExclusiveIso = addDaysIso(startIso, td);
    return { kind: 'halfOpenRange', startIso, endExclusiveIso };
  }
  return { kind: 'singleDay', dayIso: normalizeIsoDate(formatLocalDateYmd(new Date())) };
}

export function isPropertyOooInSalesContext(propertyId: string, bookings: Booking[], ctx: SalesStatusContext): boolean {
  const pid = String(propertyId ?? '').trim();
  if (!pid) return false;
  if (ctx.kind === 'singleDay') {
    return isPropertyBlockActiveOnDate(pid, ctx.dayIso, bookings);
  }
  return hasBlockOverlapForPropertyHalfOpen(pid, ctx.startIso, ctx.endExclusiveIso, bookings);
}

/** Effective token for list + filter: OOO from BLOCK in context overrides stored status for display only. */
export function getEffectiveSalesApartmentStatus(
  propertyId: string,
  base: Property['apartmentStatus'] | null | undefined,
  bookings: Booking[],
  ctx: SalesStatusContext
): 'ooo' | NonNullable<Property['apartmentStatus']> {
  if (isPropertyOooInSalesContext(propertyId, bookings, ctx)) return 'ooo';
  const raw = base ?? 'active';
  return raw;
}
