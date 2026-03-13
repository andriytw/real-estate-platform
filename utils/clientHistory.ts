/**
 * Client History aggregation for Leads.
 * Matches records by contact identity: email, phone, company name, or (fallback) private name.
 * Financial rows are included only via explicit offerId/reservationId/bookingId links.
 */

import type { Lead, OfferData, Booking, InvoiceData, ReservationData, Property } from '../types';

export interface ClientHistoryContext {
  leads: Lead[];
  offers: OfferData[];
  reservations: ReservationData[];
  confirmedBookings: Booking[];
  invoices: InvoiceData[];
  proformas: InvoiceData[];
  properties: Property[];
  paymentProofsByInvoiceId?: Record<string, { id: string; invoiceId: string; createdAt: string }[]>;
}

export interface ClientHistory {
  lead: Lead;
  matchedLeadIds: Set<string>;
  matchedOffers: OfferData[];
  matchedReservations: ReservationData[];
  matchedBookings: Booking[];
  matchedInvoices: InvoiceData[];
  matchedProformas: InvoiceData[];
  limitedByIdentity: boolean;
  /** Totals from matched invoices/proformas */
  totalGross: number;
  totalPaid: number;
  totalOpen: number;
  depositReceived: number;
  depositReturned: number;
  /** Activity events (newest first): type + date + optional label */
  activity: Array<{ type: string; date: string; label?: string }>;
}

function norm(s: string | undefined | null): string {
  if (s == null) return '';
  return String(s).trim();
}

function normEmail(s: string | undefined | null): string {
  return norm(s).toLowerCase();
}

function normPhone(s: string | undefined | null): string {
  const t = norm(s).replace(/\s+/g, ' ').replace(/[-–—]/g, '-');
  return t;
}

/** ReservationData has email/phone; raw Reservation has clientEmail/clientPhone */
function getReservationEmail(r: { email?: string; clientEmail?: string }): string {
  return normEmail(r.email ?? r.clientEmail);
}

function getReservationPhone(r: { phone?: string; clientPhone?: string }): string {
  return normPhone(r.phone ?? r.clientPhone);
}

function getOfferClientName(o: OfferData): string {
  return norm(o.clientName);
}

/** Client display name for reservation (ReservationData has guest; raw has clientFirstName/clientLastName) */
function getReservationClientName(r: { guest?: string; clientFirstName?: string; clientLastName?: string }): string {
  if (r.guest) return norm(r.guest);
  const first = norm((r as { clientFirstName?: string }).clientFirstName);
  const last = norm((r as { clientLastName?: string }).clientLastName);
  return `${first} ${last}`.trim() || '';
}

function leadMatchesByEmail(lead: Lead, email: string): boolean {
  const e = normEmail(lead.email);
  return e !== '' && e === email;
}

function leadMatchesByPhone(lead: Lead, phone: string): boolean {
  const p = normPhone(lead.phone);
  return p !== '' && p === phone;
}

function leadMatchesByCompanyName(lead: Lead, name: string): boolean {
  if (lead.type !== 'Company') return false;
  return norm(lead.name) === norm(name);
}

function leadMatchesByPrivateName(lead: Lead, name: string): boolean {
  if (norm(lead.email) !== '' || norm(lead.phone) !== '') return false;
  if (lead.type !== 'Private') return false;
  return norm(lead.name) === norm(name);
}

export function buildClientHistoryForLead(lead: Lead, context: ClientHistoryContext): ClientHistory {
  const {
    leads,
    offers,
    reservations,
    confirmedBookings,
    invoices,
    proformas,
    properties: _properties,
  } = context;

  const leadEmail = normEmail(lead.email);
  const leadPhone = normPhone(lead.phone);
  const hasIdentity = leadEmail !== '' || leadPhone !== '';
  const limitedByIdentity = !hasIdentity;

  const matchedLeadIds = new Set<string>();
  matchedLeadIds.add(lead.id);

  if (hasIdentity) {
    leads.forEach((l) => {
      if (l.id === lead.id) return;
      if (leadEmail && leadMatchesByEmail(l, leadEmail)) matchedLeadIds.add(l.id);
      else if (leadPhone && leadMatchesByPhone(l, leadPhone)) matchedLeadIds.add(l.id);
      else if (lead.type === 'Company' && leadMatchesByCompanyName(lead, l.name)) matchedLeadIds.add(l.id);
      else if (leadMatchesByPrivateName(lead, l.name)) matchedLeadIds.add(l.id);
    });
  }

  const matchedOffers: OfferData[] = [];
  offers.forEach((o) => {
    if (o.leadId != null && matchedLeadIds.has(String(o.leadId))) {
      matchedOffers.push(o);
      return;
    }
    if (leadEmail && normEmail(o.email) === leadEmail) { matchedOffers.push(o); return; }
    if (leadPhone && normPhone(o.phone) === leadPhone) { matchedOffers.push(o); return; }
    if (lead.type === 'Company' && norm(o.clientName) === norm(lead.name)) { matchedOffers.push(o); return; }
    if (limitedByIdentity && leadMatchesByPrivateName(lead, getOfferClientName(o))) matchedOffers.push(o);
  });

  const matchedReservations: ReservationData[] = [];
  reservations.forEach((r) => {
    const rEmail = getReservationEmail(r);
    const rPhone = getReservationPhone(r);
    if (leadEmail && rEmail !== '' && rEmail === leadEmail) { matchedReservations.push(r); return; }
    if (leadPhone && rPhone !== '' && rPhone === leadPhone) { matchedReservations.push(r); return; }
    if (lead.type === 'Company' && norm(getReservationClientName(r)) === norm(lead.name)) { matchedReservations.push(r); return; }
    if (limitedByIdentity && lead.type === 'Private' && norm(getReservationClientName(r)) === norm(lead.name)) matchedReservations.push(r);
  });

  const matchedBookings: Booking[] = [];
  confirmedBookings.forEach((b) => {
    const bEmail = normEmail(b.email);
    const bPhone = normPhone(b.phone);
    if (leadEmail && bEmail !== '' && bEmail === leadEmail) { matchedBookings.push(b); return; }
    if (leadPhone && bPhone !== '' && bPhone === leadPhone) { matchedBookings.push(b); return; }
  });

  const matchedOfferIds = new Set(matchedOffers.map((o) => String(o.id)));
  const matchedReservationIds = new Set(matchedReservations.map((r) => String((r as { id?: string }).id ?? (r as Booking).id)));
  const matchedBookingIds = new Set(matchedBookings.map((b) => String(b.id)));

  const matchedInvoices: InvoiceData[] = [];
  const matchedProformas: InvoiceData[] = [];
  const seenIds = new Set<string>();
  const allInvoices = [...invoices, ...proformas];
  allInvoices.forEach((inv) => {
    const linkedByOffer = inv.offerId != null && matchedOfferIds.has(String(inv.offerId));
    const linkedByOfferSource = inv.offerIdSource != null && matchedOfferIds.has(String(inv.offerIdSource));
    const linkedByRes = inv.reservationId != null && matchedReservationIds.has(String(inv.reservationId));
    const linkedByBooking = inv.bookingId != null && matchedBookingIds.has(String(inv.bookingId));
    if (!(linkedByOffer || linkedByOfferSource || linkedByRes || linkedByBooking)) return;
    if (seenIds.has(inv.id)) return;
    seenIds.add(inv.id);
    if (inv.documentType === 'proforma') matchedProformas.push(inv);
    else matchedInvoices.push(inv);
  });

  let totalGross = 0;
  let totalPaid = 0;
  let totalOpen = 0;
  let depositReceived = 0;
  let depositReturned = 0;
  const allFinancial = [...matchedProformas, ...matchedInvoices];
  allFinancial.forEach((inv) => {
    totalGross += inv.totalGross ?? 0;
    if (inv.status === 'Paid') totalPaid += inv.totalGross ?? 0;
    else totalOpen += (inv.totalGross ?? 0);
    // Kaution: if we have a kaution field on invoice we could sum; else skip or use items
    const hasKaution = (inv as InvoiceData & { kaution?: number }).kaution != null;
    if (!hasKaution) return;
    const kaution = (inv as InvoiceData & { kaution?: number }).kaution ?? 0;
    depositReceived += kaution;
    if (inv.kautionStatus === 'returned') depositReturned += kaution;
  });

  const activity: Array<{ type: string; date: string; label?: string }> = [];
  if (lead.createdAt) activity.push({ type: 'Lead created', date: lead.createdAt, label: lead.name });
  matchedOffers.forEach((o) => {
    const d = o.createdAt ?? '';
    if (d) activity.push({ type: 'Offer created', date: d, label: o.offerNo ?? o.id });
  });
  matchedReservations.forEach((r) => {
    const d = (r as { createdAt?: string }).createdAt ?? '';
    if (d) activity.push({ type: 'Reservation created', date: d, label: (r as { reservationNo?: string }).reservationNo ?? String((r as { id?: string }).id ?? (r as Booking).id) });
  });
  matchedBookings.forEach((b) => {
    const d = b.createdAt ?? '';
    if (d) activity.push({ type: 'Booking confirmed', date: d, label: b.bookingNo ?? String(b.id) });
  });
  allFinancial.forEach((inv) => {
    if (inv.date) activity.push({ type: inv.documentType === 'proforma' ? 'Proforma created' : 'Invoice created', date: inv.date, label: inv.invoiceNumber });
  });
  activity.sort((a, b) => (b.date < a.date ? -1 : b.date > a.date ? 1 : 0));

  return {
    lead,
    matchedLeadIds,
    matchedOffers,
    matchedReservations,
    matchedBookings,
    matchedInvoices,
    matchedProformas,
    limitedByIdentity,
    totalGross,
    totalPaid,
    totalOpen,
    depositReceived,
    depositReturned,
    activity,
  };
}
