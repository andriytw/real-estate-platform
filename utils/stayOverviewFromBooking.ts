/**
 * Pure helpers for BookingDetailsModal stay overview (V1).
 * Safe on missing/partial stayContext — callers pass empty arrays.
 */
import type { Booking, InvoiceData, OfferData, PaymentProof } from '../types';

export interface StayOverviewStayContext {
  offers?: OfferData[];
  invoices?: InvoiceData[];
  paymentProofsByInvoiceId?: Record<string, PaymentProof[]>;
}

export type StayPhase = 'upcoming' | 'in_house' | 'completed';

export function parseLocalDay(iso: string | undefined): Date | null {
  if (iso == null || typeof iso !== 'string') return null;
  const d = iso.slice(0, 10);
  const parts = d.split('-').map(Number);
  const y = parts[0];
  const m = parts[1];
  const day = parts[2];
  if (!y || !m || !day) return null;
  const dt = new Date(y, m - 1, day);
  dt.setHours(0, 0, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function computeNights(start: string | undefined, end: string | undefined): number | null {
  const a = parseLocalDay(start);
  const b = parseLocalDay(end);
  if (!a || !b) return null;
  const ms = b.getTime() - a.getTime();
  const days = Math.round(ms / (86_400_000));
  return days > 0 ? days : null;
}

export function getStayPhase(booking: Booking, today = new Date()): StayPhase {
  const t = new Date(today);
  t.setHours(0, 0, 0, 0);
  const start = parseLocalDay(booking.start);
  const end = parseLocalDay(booking.end);
  if (!start || !end) return 'upcoming';
  if (t.getTime() < start.getTime()) return 'upcoming';
  if (t.getTime() > end.getTime()) return 'completed';
  return 'in_house';
}

function findInvoiceById(invoices: InvoiceData[], id: string | undefined): InvoiceData | null {
  if (id == null || id === '') return null;
  return invoices.find((i) => String(i.id) === String(id)) ?? null;
}

export interface ResolvedStayChain {
  offer: OfferData | null;
  proforma: InvoiceData | null;
  finalInvoice: InvoiceData | null;
  /** Invoice row pointed to by booking.sourceInvoiceId (if any) */
  sourceInvoice: InvoiceData | null;
  currentProof: PaymentProof | null;
}

export function resolveStayChain(booking: Booking, ctx: StayOverviewStayContext): ResolvedStayChain {
  const offers = ctx.offers ?? [];
  const invoices = ctx.invoices ?? [];
  const proofsMap = ctx.paymentProofsByInvoiceId ?? {};

  const isOfferBar = (booking as { isOffer?: boolean }).isOffer === true;
  const offerFromBar = isOfferBar ? offers.find((o) => String(o.id) === String(booking.id)) : null;
  const offer =
    offerFromBar ??
    (booking.sourceOfferId ? offers.find((o) => String(o.id) === String(booking.sourceOfferId)) : null) ??
    null;

  const sourceInvoice = booking.sourceInvoiceId
    ? findInvoiceById(invoices, String(booking.sourceInvoiceId))
    : null;

  let proforma: InvoiceData | null = null;
  let finalInvoice: InvoiceData | null = null;

  if (sourceInvoice) {
    if (sourceInvoice.documentType === 'proforma') {
      proforma = sourceInvoice;
      finalInvoice =
        invoices.find(
          (i) =>
            i.documentType === 'invoice' &&
            i.proformaId != null &&
            String(i.proformaId) === String(proforma!.id)
        ) ?? null;
    } else if (sourceInvoice.documentType === 'invoice' && sourceInvoice.proformaId) {
      finalInvoice = sourceInvoice;
      proforma = findInvoiceById(invoices, String(sourceInvoice.proformaId));
    } else {
      finalInvoice = sourceInvoice;
    }
  }

  const proformaIdForProofs =
    proforma?.id ?? (sourceInvoice?.documentType === 'proforma' ? sourceInvoice.id : null);
  const proofs = proformaIdForProofs ? (proofsMap[String(proformaIdForProofs)] ?? []) : [];
  const currentProof =
    proofs.find((p) => p.isCurrent && p.filePath) ?? proofs.find((p) => p.filePath) ?? null;

  return { offer, proforma, finalInvoice, sourceInvoice, currentProof };
}

/**
 * Paid / Unpaid only when confident from invoice status or clear booking settlement signal.
 * Otherwise returns null — UI should omit badge or use neutral copy.
 */
export function derivePaymentBadge(
  booking: Booking,
  linkedInvoice: InvoiceData | null
): 'paid' | 'unpaid' | null {
  if (linkedInvoice) {
    if (linkedInvoice.status === 'Paid') return 'paid';
    if (linkedInvoice.status === 'Unpaid' || linkedInvoice.status === 'Overdue') return 'unpaid';
    return null;
  }
  const raw = booking.balance != null ? String(booking.balance).trim().replace(/\s+/g, ' ') : '';
  if (!raw) return null;
  const zeroish =
    /^0[.,]0+\s*EUR$/i.test(raw) ||
    /^0\s*EUR$/i.test(raw) ||
    raw === '0.00 EUR' ||
    raw === '0,00 EUR';
  if (zeroish) {
    const st = String(booking.status ?? '').toLowerCase();
    if (st.includes('invoiced') || st.includes('paid')) return 'paid';
  }
  return null;
}

export interface TimelineRow {
  label: string;
  at?: string;
  sortKey: number;
}

/** Max 5 rows, compact labels, real timestamps only */
export function buildCompactTimeline(booking: Booking, chain: ResolvedStayChain): TimelineRow[] {
  const rows: TimelineRow[] = [];

  if (booking.createdAt) {
    const t = Date.parse(booking.createdAt);
    if (!Number.isNaN(t)) {
      rows.push({ label: 'Booking recorded', at: booking.createdAt, sortKey: t });
    }
  }

  if (chain.proforma?.date) {
    const t = Date.parse(chain.proforma.date);
    if (!Number.isNaN(t)) {
      rows.push({ label: 'Proforma (linked)', at: chain.proforma.date, sortKey: t });
    }
  }

  if (
    chain.finalInvoice?.date &&
    (!chain.proforma || String(chain.finalInvoice.id) !== String(chain.proforma.id))
  ) {
    const t = Date.parse(chain.finalInvoice.date);
    if (!Number.isNaN(t)) {
      rows.push({ label: 'Invoice (linked)', at: chain.finalInvoice.date, sortKey: t });
    }
  }

  if (chain.currentProof?.fileUploadedAt) {
    const t = Date.parse(chain.currentProof.fileUploadedAt);
    if (!Number.isNaN(t)) {
      rows.push({ label: 'Payment proof uploaded', at: chain.currentProof.fileUploadedAt, sortKey: t });
    }
  } else if (chain.currentProof?.createdAt) {
    const t = Date.parse(chain.currentProof.createdAt);
    if (!Number.isNaN(t)) {
      rows.push({ label: 'Payment proof available', at: chain.currentProof.createdAt, sortKey: t });
    }
  }

  if (chain.currentProof?.rpcConfirmedAt) {
    const t = Date.parse(chain.currentProof.rpcConfirmedAt);
    if (!Number.isNaN(t)) {
      rows.push({ label: 'Payment confirmed', at: chain.currentProof.rpcConfirmedAt, sortKey: t });
    }
  }

  rows.sort((a, b) => a.sortKey - b.sortKey);
  return rows.slice(0, 5);
}

export function formatTimelineDate(iso: string | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}
