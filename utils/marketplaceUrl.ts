/**
 * Shared marketplace / property listing URL resolution.
 * Used by BookingDetailsModal and offer email (salesOfferFlow).
 */

export function getMarketplaceBaseUrl(): string {
  return (
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_PUBLIC_APP_URL) ||
    (typeof import.meta !== 'undefined' && (import.meta.env as any)?.NEXT_PUBLIC_APP_URL) ||
    (typeof window !== 'undefined' ? window.location.origin : '')
  );
}

export function getMarketplaceUrlForProperty(
  prop: { marketplaceUrl?: string | null; id?: string; propertyId?: string } | null,
  baseUrl: string
): string | undefined {
  if (!prop) return undefined;
  if (prop.marketplaceUrl && String(prop.marketplaceUrl).trim()) return String(prop.marketplaceUrl).trim();
  const id = prop.id || prop.propertyId;
  if (id && baseUrl) return `${baseUrl.replace(/\/+$/, '')}/property/${id}`;
  return undefined;
}
