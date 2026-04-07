/**
 * Geocode suggestions for market map search.
 * Tries /api/mapbox/geocode first; on failure falls back to direct Mapbox API.
 * Client-only: uses import.meta.env.NEXT_PUBLIC_MAPBOX_TOKEN (no process.env).
 */

import {
  mapboxGeocodeSuggestionFromFeature,
  type GeocodeSuggestion,
} from './mapboxAddressFromFeature';

export type { GeocodeSuggestion };

export async function fetchSuggestions(q: string, limit = 5): Promise<GeocodeSuggestion[]> {
  const trimmed = q.trim();
  if (trimmed.length < 3) {
    return [];
  }

  const token = import.meta.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const encoded = encodeURIComponent(trimmed);
  const apiPath = `/api/mapbox/geocode?q=${encoded}&limit=${limit}`;

  try {
    const res = await fetch(apiPath);
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    }
  } catch {
    // fetch failed (e.g. no /api in vite dev) — fallback below
  }

  if (!token) {
    return [];
  }

  const mapboxUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${token}&limit=${limit}`;
  try {
    const res = await fetch(mapboxUrl);
    if (!res.ok) return [];
    const data = await res.json();
    const features = Array.isArray(data.features) ? data.features : [];
    return features.slice(0, limit).map((f: unknown) => mapboxGeocodeSuggestionFromFeature(f));
  } catch {
    return [];
  }
}
