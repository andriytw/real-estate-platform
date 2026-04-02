import type { Booking, InvoiceData, OfferData, Reservation } from '../../types';
import { clampIntervalToMonth, eachOverlapDay } from './date';
import type { DashboardDayCell } from './types';

interface ResolverContext {
  bookings: Booking[];
  reservations: Reservation[];
  offers: OfferData[];
  proformas: InvoiceData[];
  monthFromIso: string;
  monthToIsoExclusive: string;
}

export interface PaidProformaContribution {
  propertyId: string;
  proforma: InvoiceData;
  /** Confirmed interval used for this paid proforma (booking/reservation/offer derived). */
  interval: { startIso: string; endIsoExclusive: string };
  /** Interval clamped to selected month. */
  clamped: { startIso: string; endIsoExclusive: string };
  /** Days in selected month that receive revenue allocation. */
  overlapDays: string[];
  /** Total nights in full confirmed interval (unclamped). */
  fullIntervalNights: number;
  /** Net per night used for allocation (same as buildConfirmedRevenueMap). */
  nightlyNet: number;
  /** Allocated net for the selected month (nightlyNet * overlapDays.length). */
  allocatedNetForMonth: number;
}

function getPropertyIdForProforma(
  proforma: InvoiceData,
  ctx: { offers: OfferData[]; reservations: Reservation[]; bookings: Booking[] }
): string | undefined {
  const bid = proforma.bookingId != null ? String(proforma.bookingId) : null;
  if (bid) {
    const b = ctx.bookings.find((x) => String(x.id) === bid);
    if (b?.propertyId) return String(b.propertyId);
  }

  const rid = proforma.reservationId != null ? String(proforma.reservationId) : null;
  if (rid) {
    const r = ctx.reservations.find((x) => String(x.id) === rid);
    if (r?.propertyId) return String(r.propertyId);
  }

  const oid = proforma.offerId ?? proforma.offerIdSource;
  if (oid != null) {
    const o = ctx.offers.find((x) => String(x.id) === String(oid));
    if (o?.propertyId) return String(o.propertyId);
  }

  return undefined;
}

function parseOfferDates(offer?: OfferData): { startIso: string; endIsoExclusive: string } | null {
  if (!offer?.dates) return null;
  const [startRaw, endRaw] = String(offer.dates).split(' to ');
  const startIso = (startRaw || '').slice(0, 10);
  const endIsoExclusive = (endRaw || '').slice(0, 10);
  if (!startIso || !endIsoExclusive || startIso >= endIsoExclusive) return null;
  return { startIso, endIsoExclusive };
}

function getConfirmedIntervalForProforma(
  proforma: InvoiceData,
  ctx: { bookings: Booking[]; reservations: Reservation[]; offers: OfferData[] }
): { startIso: string; endIsoExclusive: string } | null {
  const bid = proforma.bookingId != null ? String(proforma.bookingId) : null;
  if (bid) {
    const b = ctx.bookings.find((x) => String(x.id) === bid);
    if (b?.start && b?.end && b.start < b.end) {
      return { startIso: b.start.slice(0, 10), endIsoExclusive: b.end.slice(0, 10) };
    }
  }

  const rid = proforma.reservationId != null ? String(proforma.reservationId) : null;
  if (rid) {
    const r = ctx.reservations.find((x) => String(x.id) === rid);
    if (r?.startDate && r?.endDate && r.startDate < r.endDate) {
      return { startIso: r.startDate.slice(0, 10), endIsoExclusive: r.endDate.slice(0, 10) };
    }
  }

  const oid = proforma.offerId ?? proforma.offerIdSource;
  if (oid) {
    const offer = ctx.offers.find((x) => String(x.id) === String(oid));
    return parseOfferDates(offer);
  }

  return null;
}

function getFallbackNightlyNet(
  proforma: InvoiceData,
  ctx: { bookings: Booking[]; reservations: Reservation[]; offers: OfferData[] }
): number {
  const rid = proforma.reservationId != null ? String(proforma.reservationId) : null;
  if (rid) {
    const r = ctx.reservations.find((x) => String(x.id) === rid);
    if (r?.pricePerNightNet != null && Number.isFinite(Number(r.pricePerNightNet))) {
      return Number(r.pricePerNightNet);
    }
  }

  const oid = proforma.offerId ?? proforma.offerIdSource;
  if (oid) {
    const offer = ctx.offers.find((x) => String(x.id) === String(oid));
    if (offer?.nightlyPrice != null && Number.isFinite(Number(offer.nightlyPrice))) {
      return Number(offer.nightlyPrice);
    }
    const nights = Number(offer?.nights ?? 0);
    const netTotal = Number(offer?.netTotal ?? 0);
    if (nights > 0 && Number.isFinite(netTotal) && netTotal > 0) {
      return netTotal / nights;
    }
  }

  const bid = proforma.bookingId != null ? String(proforma.bookingId) : null;
  if (bid) {
    const b = ctx.bookings.find((x) => String(x.id) === bid);
    if (b?.pricePerNight != null && Number.isFinite(Number(b.pricePerNight))) {
      return Number(b.pricePerNight);
    }
  }

  return 0;
}

function getNightlyNetForProforma(
  proforma: InvoiceData,
  intervalNights: number,
  ctx: { bookings: Booking[]; reservations: Reservation[]; offers: OfferData[] }
): number {
  // Preferred source: paid proforma/invoice-derived total NET split by confirmed interval nights.
  const netTotal = Number(proforma.totalNet ?? 0);
  if (intervalNights > 0 && Number.isFinite(netTotal) && netTotal > 0) {
    return netTotal / intervalNights;
  }

  // Fallbacks from confirmed lineage entities.
  return getFallbackNightlyNet(proforma, ctx);
}

/**
 * OOO (Out Of Order) days from `bookings` where `type === 'BLOCK'` only.
 * Revenue (`buildConfirmedRevenueMap`) is driven by paid proformas, not raw booking rows;
 * BLOCK rows are excluded from guest-stay semantics unless linked via a paid invoice (unlikely).
 */
export function buildDailyOooMap(
  propertyIds: string[],
  days: string[],
  bookings: Booking[]
): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  const monthFrom = days[0];
  const monthTo = days[days.length - 1];
  if (!monthFrom || !monthTo) return result;
  const monthToExclusiveReal = (() => {
    const [y, m, d] = monthTo.split('-').map(Number);
    const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + 1));
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  })();

  const allowed = new Set(propertyIds.map(String));
  for (const booking of bookings) {
    const pid = booking.propertyId ? String(booking.propertyId) : '';
    if (!pid || !allowed.has(pid)) continue;
    if (String(booking.type || '').toUpperCase() !== 'BLOCK') continue;
    const bStart = booking.start?.slice(0, 10);
    const bEnd = booking.end?.slice(0, 10);
    if (!bStart || !bEnd || bStart >= bEnd) continue;
    const clamped = clampIntervalToMonth(bStart, bEnd, monthFrom, monthToExclusiveReal);
    if (!clamped) continue;
    const overlapDays = eachOverlapDay(clamped.startIso, clamped.endIsoExclusive);
    if (!result.has(pid)) result.set(pid, new Set<string>());
    const set = result.get(pid)!;
    overlapDays.forEach((iso) => set.add(iso));
  }
  return result;
}

export function buildConfirmedRevenueMap(
  propertyIds: string[],
  days: string[],
  ctx: ResolverContext
): Map<string, Map<string, number>> {
  const result = new Map<string, Map<string, number>>();
  const contributionsByProperty = buildPaidProformaContributionsByProperty(propertyIds, days, ctx);
  for (const [propertyId, contributions] of contributionsByProperty) {
    if (contributions.length === 0) continue;
    if (!result.has(propertyId)) result.set(propertyId, new Map<string, number>());
    const byDay = result.get(propertyId)!;
    for (const c of contributions) {
      for (const day of c.overlapDays) {
        byDay.set(day, (byDay.get(day) || 0) + c.nightlyNet);
      }
    }
  }

  return result;
}

/**
 * Canonical revenue drilldown helper.
 *
 * Returns per-apartment (propertyId) contributing paid-proforma rows for the selected month,
 * using the exact same lineage/proration semantics as `buildConfirmedRevenueMap`.
 *
 * Level-2 identity must remain grounded in the paid proforma (may be enriched with booking/reservation/offer identifiers).
 */
export function buildPaidProformaContributionsByProperty(
  propertyIds: string[],
  days: string[],
  ctx: ResolverContext
): Map<string, PaidProformaContribution[]> {
  const out = new Map<string, PaidProformaContribution[]>();
  const allowed = new Set(propertyIds.map(String));
  const daysSet = new Set(days);
  const paidProformas = ctx.proformas.filter((p) => p.status === 'Paid');

  for (const proforma of paidProformas) {
    const propertyId = getPropertyIdForProforma(proforma, {
      offers: ctx.offers,
      reservations: ctx.reservations,
      bookings: ctx.bookings,
    });
    if (!propertyId || !allowed.has(String(propertyId))) continue;

    const interval = getConfirmedIntervalForProforma(proforma, {
      bookings: ctx.bookings,
      reservations: ctx.reservations,
      offers: ctx.offers,
    });
    if (!interval) continue;

    const clamped = clampIntervalToMonth(interval.startIso, interval.endIsoExclusive, ctx.monthFromIso, ctx.monthToIsoExclusive);
    if (!clamped) continue;

    const fullIntervalNights = eachOverlapDay(interval.startIso, interval.endIsoExclusive).length;
    const overlapDays = eachOverlapDay(clamped.startIso, clamped.endIsoExclusive).filter((d) => daysSet.has(d));
    if (overlapDays.length === 0) continue;

    const nightlyNet = getNightlyNetForProforma(proforma, fullIntervalNights, {
      bookings: ctx.bookings,
      reservations: ctx.reservations,
      offers: ctx.offers,
    });
    if (!Number.isFinite(nightlyNet) || nightlyNet <= 0) continue;

    const entry: PaidProformaContribution = {
      propertyId: String(propertyId),
      proforma,
      interval,
      clamped,
      overlapDays,
      fullIntervalNights,
      nightlyNet,
      allocatedNetForMonth: nightlyNet * overlapDays.length,
    };

    if (!out.has(entry.propertyId)) out.set(entry.propertyId, []);
    out.get(entry.propertyId)!.push(entry);
  }

  for (const list of out.values()) {
    list.sort((a, b) => {
      const cmp = b.clamped.startIso.localeCompare(a.clamped.startIso);
      if (cmp !== 0) return cmp;
      return String(b.proforma.id).localeCompare(String(a.proforma.id));
    });
  }

  return out;
}

export function resolveApartmentDayCell(
  propertyId: string,
  dayIso: string,
  maps: { oooByProperty: Map<string, Set<string>>; revenueByProperty: Map<string, Map<string, number>> }
): DashboardDayCell {
  const isOoo = maps.oooByProperty.get(propertyId)?.has(dayIso) ?? false;
  if (isOoo) return { kind: 'ooo', amountNet: null };

  const value = maps.revenueByProperty.get(propertyId)?.get(dayIso) ?? 0;
  if (value > 0) return { kind: 'value', amountNet: value };
  return { kind: 'zero', amountNet: 0 };
}
