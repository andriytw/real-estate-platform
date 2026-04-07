/**
 * Pure Mapbox Geocoding API v5 feature → suggestion for UI (country, postcode, city, street, houseNumber).
 * Does not invent missing parts; house number only from properties.address when present.
 */

export interface GeocodeSuggestion {
  label: string;
  lat: number;
  lng: number;
  /** ISO or display country name from context */
  country?: string;
  postcode?: string;
  /** City / locality — Mapbox "place" or "locality", not the raw API key name "place" in JSON output */
  city?: string;
  street?: string;
  houseNumber?: string;
}

interface MapboxContextItem {
  id?: string;
  text?: string;
}

interface MapboxFeatureProperties {
  address?: string;
}

export interface MapboxGeocodeFeature {
  place_name?: string;
  text?: string;
  center?: [number, number];
  place_type?: string[];
  properties?: MapboxFeatureProperties;
  context?: MapboxContextItem[];
}

function pickContext(ctx: MapboxContextItem[], layerPrefix: string): string | undefined {
  const item = ctx.find((c) => typeof c?.id === 'string' && c.id.startsWith(`${layerPrefix}.`));
  const t = item?.text?.trim();
  return t || undefined;
}

/**
 * Map one Mapbox Places feature to GeocodeSuggestion (extended fields optional).
 */
export function mapboxGeocodeSuggestionFromFeature(raw: unknown): GeocodeSuggestion {
  const f = raw as MapboxGeocodeFeature;
  const center = Array.isArray(f.center) && f.center.length >= 2 ? f.center : [0, 0];
  const lng = typeof center[0] === 'number' ? center[0] : 0;
  const lat = typeof center[1] === 'number' ? center[1] : 0;
  const label = (f.place_name || '').trim();
  const ctx = Array.isArray(f.context) ? f.context : [];

  const country = pickContext(ctx, 'country');
  const postcode = pickContext(ctx, 'postcode');
  const city = pickContext(ctx, 'place') || pickContext(ctx, 'locality') || pickContext(ctx, 'district');

  const placeTypes = Array.isArray(f.place_type) ? f.place_type : [];
  const isAddress = placeTypes.includes('address');

  const addrRaw = f.properties && typeof f.properties.address === 'string' ? f.properties.address.trim() : '';
  const houseNumber = addrRaw || undefined;

  let street: string | undefined;
  if (isAddress && typeof f.text === 'string') {
    const t = f.text.trim();
    street = t || undefined;
  }

  const base: GeocodeSuggestion = {
    label,
    lat,
    lng,
  };
  if (country) base.country = country;
  if (postcode) base.postcode = postcode;
  if (city) base.city = city;
  if (street) base.street = street;
  if (houseNumber) base.houseNumber = houseNumber;

  return base;
}
