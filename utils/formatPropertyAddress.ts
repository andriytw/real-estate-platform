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
