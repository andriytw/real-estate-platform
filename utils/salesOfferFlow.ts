import { MultiApartmentOfferDraftApartment, SelectedApartmentData } from '../types';

export function calculateOfferNights(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0;
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

export function calculateOfferItemTotals(
  nightlyPrice: number,
  taxRate: number,
  nights: number
) {
  const safeNightlyPrice = Number.isFinite(nightlyPrice) ? nightlyPrice : 0;
  const safeTaxRate = Number.isFinite(taxRate) ? taxRate : 0;
  const safeNights = Number.isFinite(nights) ? nights : 0;
  const netTotal = safeNightlyPrice * safeNights;
  const vatAmount = netTotal * (safeTaxRate / 100);
  const grossTotal = netTotal + vatAmount;
  return {
    netTotal,
    vatAmount,
    grossTotal,
  };
}

export function formatApartmentIdentificationLine(apartment: {
  street: string;
  houseNumber?: string | null;
  zip: string;
  city: string;
  apartmentCode: string;
}) {
  const streetPart = [apartment.street, apartment.houseNumber].filter(Boolean).join(' ');
  const cityPart = [apartment.zip, apartment.city].filter(Boolean).join(' ');
  return [streetPart, cityPart].filter(Boolean).join(', ') + ` — ${apartment.apartmentCode}`;
}

export function buildMultiApartmentClientMessage(params: {
  clientLabel: string;
  internalCompany: string;
  checkIn: string;
  checkOut: string;
  apartments: Array<SelectedApartmentData | MultiApartmentOfferDraftApartment>;
}) {
  const { clientLabel, internalCompany, checkIn, checkOut, apartments } = params;
  const nights = calculateOfferNights(checkIn, checkOut);

  const apartmentBlocks = apartments.map((apartment) => {
    const draft = apartment as MultiApartmentOfferDraftApartment;
    const nightlyPrice = Number.isFinite(draft.nightlyPrice) ? draft.nightlyPrice : 0;
    const taxRate = Number.isFinite(draft.taxRate) ? draft.taxRate : 19;
    const { netTotal, vatAmount, grossTotal } = calculateOfferItemTotals(nightlyPrice, taxRate, nights);
    const addressUnit = formatApartmentIdentificationLine(apartment);
    const infoLine = `${addressUnit} — ${nightlyPrice} €/night · ${nights} nights · Net ${Math.round(netTotal)} € · VAT ${Math.round(vatAmount)} € · Gross ${Math.round(grossTotal)} €`;
    const linkLine = apartment.marketplaceUrl ? `View apartment: ${apartment.marketplaceUrl}` : '';
    return linkLine ? `${infoLine}\n${linkLine}` : infoLine;
  });

  return `Hello ${clientLabel || 'Client'},

thank you for your interest in the following apartments:

${apartmentBlocks.join('\n\n')}

Requested stay: ${checkIn}${checkOut ? ` – ${checkOut}` : ''}

Please find the offer attached.

Best regards,
${internalCompany} Team`;
}
