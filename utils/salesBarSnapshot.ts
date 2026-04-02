/**
 * Read-only financial/stay snapshot for Sales Calendar guest booking bars.
 * Source priority matches plan: offer totals first, then invoice/proforma; no fresh business math.
 */
import type { Booking, InvoiceData, OfferData, Property } from '../types';
import { getRoomsCount } from './propertyStats';
import { computeNights, resolveStayChain, type StayOverviewStayContext } from './stayOverviewFromBooking';

export type KautionTone = 'red' | 'green' | 'neutral';

export interface SalesBarSnapshot {
  tenant: string;
  nights: number | null;
  guestsDisplay: string;
  /** Proforma document number (e.g. PRO-…), or — */
  proformaDisplay: string;
  pricePerNightDisplay: string;
  pricePerRoomNightDisplay: string;
  totalPerDayDisplay: string;
  netDisplay: string;
  vatDisplay: string;
  grossDisplay: string;
  kautionDisplay: string;
  kautionTone: KautionTone | null;
}

function fmtEuro(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return `${Number(n).toFixed(2)} €`;
}

function pickInvoiceForTotals(chain: ReturnType<typeof resolveStayChain>): InvoiceData | null {
  return chain.finalInvoice ?? chain.proforma ?? chain.sourceInvoice;
}

function kautionToneFromStatus(
  s: InvoiceData['kautionStatus'] | undefined
): KautionTone | null {
  if (s === 'returned') return 'green';
  if (s === 'not_returned') return 'red';
  if (s === 'partially_returned') return 'neutral';
  return null;
}

export function buildSalesBarSnapshot(
  booking: Booking,
  ctx: { offers: OfferData[]; invoices: InvoiceData[]; properties: Property[] }
): SalesBarSnapshot {
  const stayCtx: StayOverviewStayContext = { offers: ctx.offers, invoices: ctx.invoices };
  const chain = resolveStayChain(booking, stayCtx);
  const { offer } = chain;
  const inv = pickInvoiceForTotals(chain);

  const tenant = (() => {
    const raw = booking.guest != null && String(booking.guest).trim() ? String(booking.guest).trim() : '';
    if (raw) return raw;
    const cn = offer?.clientName?.trim();
    if (cn) return cn;
    return '—';
  })();

  const nights = computeNights(booking.start, booking.end);

  const guestsDisplay = (() => {
    const g = booking.guests;
    if (g == null || String(g).trim() === '') return '—';
    return String(g).trim();
  })();

  const proformaDisplay = (() => {
    const n = chain.proforma?.invoiceNumber;
    const t = n != null ? String(n).trim() : '';
    return t || '—';
  })();

  const nightlyRaw =
    booking.pricePerNight != null && Number.isFinite(Number(booking.pricePerNight))
      ? Number(booking.pricePerNight)
      : offer?.nightlyPrice != null && Number.isFinite(Number(offer.nightlyPrice))
        ? Number(offer.nightlyPrice)
        : null;

  const net =
    offer?.netTotal != null && Number.isFinite(Number(offer.netTotal))
      ? Number(offer.netTotal)
      : inv?.totalNet != null && Number.isFinite(Number(inv.totalNet))
        ? Number(inv.totalNet)
        : null;
  const vat =
    offer?.vatTotal != null && Number.isFinite(Number(offer.vatTotal))
      ? Number(offer.vatTotal)
      : inv?.taxAmount != null && Number.isFinite(Number(inv.taxAmount))
        ? Number(inv.taxAmount)
        : null;
  const gross =
    offer?.grossTotal != null && Number.isFinite(Number(offer.grossTotal))
      ? Number(offer.grossTotal)
      : inv?.totalGross != null && Number.isFinite(Number(inv.totalGross))
        ? Number(inv.totalGross)
        : null;

  const pricePerNightEffective =
    nightlyRaw ??
    (gross != null && nights != null && nights > 0 ? gross / nights : null);
  const pricePerNightDisplay = fmtEuro(pricePerNightEffective);

  const pid = String(booking.propertyId ?? booking.roomId ?? '').trim();
  const property = pid ? ctx.properties.find((p) => String(p.id) === pid) : undefined;
  const rooms = getRoomsCount(property ?? null);
  const pricePerRoomNightDisplay =
    pricePerNightEffective != null && rooms > 0 ? fmtEuro(pricePerNightEffective / rooms) : '—';

  const totalPerDayDisplay =
    gross != null && nights != null && nights > 0 ? fmtEuro(gross / nights) : '—';

  const kautionNum =
    offer?.kaution != null && Number.isFinite(Number(offer.kaution)) ? Number(offer.kaution) : null;
  const kautionDisplay = fmtEuro(kautionNum);

  const kStatus =
    chain.finalInvoice?.kautionStatus ??
    chain.proforma?.kautionStatus ??
    chain.sourceInvoice?.kautionStatus;
  const kautionTone =
    kautionNum != null && kautionNum > 0 ? kautionToneFromStatus(kStatus) : null;

  return {
    tenant,
    nights,
    guestsDisplay,
    proformaDisplay,
    pricePerNightDisplay,
    pricePerRoomNightDisplay,
    totalPerDayDisplay,
    netDisplay: fmtEuro(net),
    vatDisplay: fmtEuro(vat),
    grossDisplay: fmtEuro(gross),
    kautionDisplay,
    kautionTone,
  };
}

/** Pixels: below this, show only tenant, nights, guests, gross (plan). */
export const SALES_BAR_NARROW_MAX_PX = 220;
