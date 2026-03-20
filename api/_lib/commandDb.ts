/**
 * Pure DB row transforms for Vercel command routes (no browser Supabase import).
 * Kept in sync with services/supabaseService.ts field names.
 */

export type OfferRow = Record<string, unknown>;

export function transformOfferFromDB(db: Record<string, unknown>): Record<string, unknown> {
  const startDate = db.start_date != null ? String(db.start_date).slice(0, 10) : '';
  const endDate = db.end_date != null ? String(db.end_date).slice(0, 10) : '';
  return {
    id: db.id,
    offerNo: db.offer_no,
    clientName: db.client_name,
    propertyId: db.property_id,
    internalCompany: db.internal_company,
    price: db.price,
    dates: startDate && endDate ? `${startDate} to ${endDate}` : (db.dates || ''),
    status: db.status,
    createdAt: db.created_at,
    guests: db.guests,
    email: db.email,
    phone: db.phone,
    address: db.address,
    checkInTime: db.check_in_time,
    checkOutTime: db.check_out_time,
    guestList: db.guest_list || [],
    comments: db.comments,
    unit: db.unit,
    clientMessage: db.client_message,
    reservationId: db.reservation_id,
    offerGroupId: db.offer_group_id ?? undefined,
    itemStatus: db.item_status ?? undefined,
    streetSnapshot: db.street_snapshot ?? undefined,
    houseNumberSnapshot: db.house_number_snapshot ?? undefined,
    zipSnapshot: db.zip_snapshot ?? undefined,
    citySnapshot: db.city_snapshot ?? undefined,
    apartmentCodeSnapshot: db.apartment_code_snapshot ?? undefined,
    apartmentGroupSnapshot: db.apartment_group_snapshot ?? undefined,
    nightlyPrice: db.nightly_price != null ? Number(db.nightly_price) : undefined,
    taxRate: db.tax_rate != null ? Number(db.tax_rate) : undefined,
    nights: db.nights != null ? Number(db.nights) : undefined,
    netTotal: db.net_total != null ? Number(db.net_total) : undefined,
    vatTotal: db.vat_total != null ? Number(db.vat_total) : undefined,
    grossTotal: db.gross_total != null ? Number(db.gross_total) : undefined,
    kaution: db.kaution != null ? Number(db.kaution) : 0,
    leadId: db.lead_id ?? undefined,
  };
}

export function transformOfferToDB(offer: Record<string, unknown>): OfferRow {
  const dates = String(offer.dates || '');
  const [startDate, endDate] = dates.split(' to ');
  return {
    offer_no: offer.offerNo,
    client_name: offer.clientName,
    property_id: offer.propertyId,
    internal_company: offer.internalCompany,
    price: offer.price,
    start_date: startDate,
    end_date: endDate,
    status: offer.status,
    guests: offer.guests,
    email: offer.email,
    phone: offer.phone,
    address: offer.address,
    check_in_time: offer.checkInTime,
    check_out_time: offer.checkOutTime,
    guest_list: offer.guestList,
    comments: offer.comments,
    unit: offer.unit,
    client_message: offer.clientMessage,
    reservation_id: offer.reservationId,
    offer_group_id: offer.offerGroupId ?? null,
    item_status: offer.itemStatus ?? null,
    street_snapshot: offer.streetSnapshot ?? null,
    house_number_snapshot: offer.houseNumberSnapshot ?? null,
    zip_snapshot: offer.zipSnapshot ?? null,
    city_snapshot: offer.citySnapshot ?? null,
    apartment_code_snapshot: offer.apartmentCodeSnapshot ?? null,
    apartment_group_snapshot: offer.apartmentGroupSnapshot ?? null,
    nightly_price: offer.nightlyPrice ?? null,
    tax_rate: offer.taxRate ?? null,
    nights: offer.nights ?? null,
    net_total: offer.netTotal ?? null,
    vat_total: offer.vatTotal ?? null,
    gross_total: offer.grossTotal ?? null,
    kaution: offer.kaution ?? null,
    lead_id: offer.leadId ?? null,
  };
}

export function transformReservationToDB(reservation: Record<string, unknown>): Record<string, unknown> {
  return {
    property_id: reservation.propertyId,
    start_date: reservation.startDate,
    end_date: reservation.endDate,
    status: reservation.status,
    lead_label: reservation.leadLabel,
    client_first_name: reservation.clientFirstName,
    client_last_name: reservation.clientLastName,
    client_email: reservation.clientEmail,
    client_phone: reservation.clientPhone,
    client_address: reservation.clientAddress,
    guests_count: reservation.guestsCount,
    price_per_night_net: reservation.pricePerNightNet,
    tax_rate: reservation.taxRate,
    total_nights: reservation.totalNights,
    total_gross: reservation.totalGross,
  };
}

function isValidUUID(str: string | number | undefined): boolean {
  if (!str) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(String(str));
}

export function transformInvoiceToDB(invoice: Record<string, unknown>): Record<string, unknown> {
  const offerId = invoice.offerId || invoice.offerIdSource;
  const reservationId =
    invoice.reservationId && isValidUUID(String(invoice.reservationId))
      ? invoice.reservationId
      : null;
  const bookingId = reservationId
    ? null
    : invoice.bookingId && isValidUUID(String(invoice.bookingId))
      ? invoice.bookingId
      : null;

  return {
    invoice_number: invoice.invoiceNumber,
    date: invoice.date,
    due_date: invoice.dueDate,
    internal_company: invoice.internalCompany,
    client_name: invoice.clientName,
    client_address: invoice.clientAddress,
    items: invoice.items,
    total_net: invoice.totalNet,
    tax_amount: invoice.taxAmount,
    total_gross: invoice.totalGross,
    status: invoice.status,
    offer_id: offerId && isValidUUID(String(offerId)) ? offerId : null,
    booking_id: bookingId,
    reservation_id: reservationId,
    file_url: invoice.fileUrl ?? null,
    payment_proof_url: invoice.paymentProofUrl ?? null,
    document_type: invoice.documentType ?? 'proforma',
    proforma_id:
      invoice.proformaId && isValidUUID(String(invoice.proformaId)) ? invoice.proformaId : null,
    kaution_status: invoice.kautionStatus ?? null,
  };
}

export function transformInvoiceFromDB(db: Record<string, unknown>): Record<string, unknown> {
  return {
    id: db.id,
    invoiceNumber: db.invoice_number,
    date: db.date,
    dueDate: db.due_date,
    internalCompany: db.internal_company,
    clientName: db.client_name,
    clientAddress: db.client_address,
    items: db.items || [],
    totalNet: parseFloat(String(db.total_net)) || 0,
    taxAmount: parseFloat(String(db.tax_amount)) || 0,
    totalGross: parseFloat(String(db.total_gross)) || 0,
    status: db.status,
    offerId: db.offer_id,
    offerIdSource: db.offer_id,
    bookingId: db.booking_id,
    reservationId: db.reservation_id ?? undefined,
    fileUrl: db.file_url ?? undefined,
    paymentProofUrl: db.payment_proof_url ?? undefined,
    documentType: db.document_type ?? 'proforma',
    proformaId: db.proforma_id ?? undefined,
    kautionStatus: db.kaution_status ?? undefined,
    orchestrationStatus: db.orchestration_status ?? undefined,
  };
}
