import { MultiApartmentOfferDraftApartment, SelectedApartmentData } from '../types';
import { getMarketplaceUrlForProperty } from './marketplaceUrl';

/** Manual YYYY-MM-DD → DD.MM.YYYY for display. Returns raw string if not ISO-like. */
function formatDateISOToDDMMYYYY(iso: string): string {
  const s = String(iso || '').trim();
  const match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return s;
  const [, y, m, d] = match;
  const day = d.padStart(2, '0');
  const month = m.padStart(2, '0');
  return `${day}.${month}.${y}`;
}

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
  nights: number,
  kaution: number = 0
) {
  const safeNightlyPrice = Number.isFinite(nightlyPrice) ? nightlyPrice : 0;
  const safeTaxRate = Number.isFinite(taxRate) ? taxRate : 0;
  const safeNights = Number.isFinite(nights) ? nights : 0;
  const safeKaution = Number.isFinite(kaution) ? kaution : 0;
  const netTotal = Number((safeNightlyPrice * safeNights).toFixed(2));
  const vatAmount = Number((netTotal * (safeTaxRate / 100)).toFixed(2));
  const grossTotal = Number((netTotal + vatAmount + safeKaution).toFixed(2));
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
  /** Base URL for fallback property links (e.g. origin or VITE_PUBLIC_APP_URL). */
  marketplaceBaseUrl?: string;
  /** When true, append combined total sentence near the end of the message. */
  showTotal?: boolean;
  /** Combined totals (Net, VAT, Kaution, Gross) for all apartments. Required when showTotal is true. */
  combinedTotals?: { net: number; vat: number; kaution: number; gross: number };
}) {
  const { clientLabel, internalCompany, checkIn, checkOut, apartments, marketplaceBaseUrl = '', showTotal, combinedTotals } = params;
  const nights = calculateOfferNights(checkIn, checkOut);

  const apartmentBlocks = apartments.map((apartment) => {
    const draft = apartment as MultiApartmentOfferDraftApartment;
    const nightlyPrice = Number.isFinite(draft.nightlyPrice) ? draft.nightlyPrice : 0;
    const taxRate = Number.isFinite(draft.taxRate) ? draft.taxRate : 19;
    const kautionVal = Number.isFinite((draft as MultiApartmentOfferDraftApartment).kaution) ? (draft as MultiApartmentOfferDraftApartment).kaution! : 0;
    const { netTotal, vatAmount, grossTotal } = calculateOfferItemTotals(nightlyPrice, taxRate, nights, kautionVal);
    const addressUnit = formatApartmentIdentificationLine(apartment);
    const infoLine = `${addressUnit} — ${nightlyPrice} €/night · ${nights} nights · Net ${netTotal.toFixed(2)} € · VAT ${vatAmount.toFixed(2)} € · Kaution ${kautionVal.toFixed(2)} € · Gross ${grossTotal.toFixed(2)} €`;
    const url = getMarketplaceUrlForProperty(apartment, marketplaceBaseUrl);
    const block = url ? `• ${infoLine}\n  View apartment: ${url}` : `• ${infoLine}`;
    return block;
  });

  const checkInFormatted = checkIn ? formatDateISOToDDMMYYYY(checkIn) : '';
  const checkOutFormatted = checkOut ? formatDateISOToDDMMYYYY(checkOut) : '';
  const requestedStayLine =
    checkInFormatted && checkOutFormatted
      ? `Requested stay: ${checkInFormatted} – ${checkOutFormatted}`
      : checkInFormatted
        ? `Requested stay: ${checkInFormatted}`
        : '';
  const totalSection =
    showTotal && combinedTotals
      ? `\nTotal: Net ${combinedTotals.net.toFixed(2)} € · VAT ${combinedTotals.vat.toFixed(2)} € · Kaution ${combinedTotals.kaution.toFixed(2)} € · Gross ${combinedTotals.gross.toFixed(2)} €\n\n`
      : '\n';

  return `Hello ${clientLabel || 'Client'},

thank you for your interest in the following apartments:

${requestedStayLine}

${apartmentBlocks.join('\n\n')}
${totalSection}Please find the offer attached.

Best regards,
${internalCompany} Team`;
}
