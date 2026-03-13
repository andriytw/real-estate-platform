/**
 * Canonical property address for display (list, hero, view-mode, marketplace).
 * Prefers structured fields; falls back to legacy fullAddress/address/location.
 */

export interface PropertyAddressLike {
  address?: string;
  zip?: string;
  city?: string;
  country?: string;
  fullAddress?: string;
  location?: string;
  address_label?: string;
}

export function formatPropertyAddress(
  p: PropertyAddressLike | null | undefined
): string {
  if (p == null) return '-';

  const address = (p.address ?? '').trim();
  const zip = (p.zip ?? '').trim();
  const city = (p.city ?? '').trim();
  const country = (p.country ?? '').trim();

  const streetPart = address;
  const zipCity = [zip, city].filter(Boolean).join(' ');
  const structuredParts = [streetPart, zipCity, country].filter(Boolean);
  const fromStructured = structuredParts.join(', ').trim();

  if (fromStructured) return fromStructured;

  const fallback =
    (p.fullAddress ?? '').trim() ||
    (p.address ?? '').trim() ||
    (p.location ?? '').trim() ||
    (p.address_label ?? '').trim();
  return fallback || '-';
}

/** Property-like shape for display label (address + apartment code). */
export interface PropertyDisplayLike extends PropertyAddressLike {
  title?: string | null;
}

/**
 * Display label: "Street / address — apartment code".
 * Used in Client History modal (Rental, Financials, Offers) and Create Booking property dropdown.
 */
export function getPropertyDisplayLabel(
  p: PropertyDisplayLike | null | undefined,
  options?: { maxAddressChars?: number }
): string {
  if (p == null) return '—';
  const codePart = (p.title ?? '').trim() || '—';
  const maxChars = options?.maxAddressChars;

  let addressPart = (p.fullAddress ?? '').trim() || formatPropertyAddress(p);
  if (addressPart === '-') addressPart = (p.address ?? '').trim() || '—';

  if (maxChars != null && addressPart.length > maxChars) {
    const short = (p.address ?? '').trim() || addressPart;
    addressPart = short.length > maxChars ? short.slice(0, maxChars).trim() + '…' : short;
  }

  if (addressPart === '—' && codePart === '—') return '—';
  return `${addressPart} — ${codePart}`;
}
