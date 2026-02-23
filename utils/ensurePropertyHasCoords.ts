/**
 * Best-effort geocoding for a property: calls /api/mapbox/geocode and updates
 * lat/lng (or geocode_failed_reason). Never throws; fire-and-forget.
 */
import { propertiesService } from '../services/supabaseService';

export interface EnsurePropertyHasCoordsArgs {
  id: string;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  postalCode?: string | null;
  street?: string | null;
  houseNumber?: string | null;
  existingLat?: number | null;
  existingLng?: number | null;
}

export async function ensurePropertyHasCoords(args: EnsurePropertyHasCoordsArgs): Promise<void> {
  const { id, address, city, country, postalCode, street, houseNumber, existingLat, existingLng } = args;

  try {
    if (Number.isFinite(existingLat) && Number.isFinite(existingLng)) {
      return;
    }

    const defaultCountry = country ?? 'Germany';

    let q: string;
    if (street != null && street !== '' && houseNumber != null && houseNumber !== '' && city != null && city !== '') {
      q = `${street} ${houseNumber}, ${postalCode ?? ''} ${city}, ${defaultCountry}`;
    } else if (address != null && address !== '' && city != null && city !== '') {
      q = `${address}, ${city}, ${defaultCountry}`;
    } else if (address != null && address !== '') {
      q = `${address}, ${defaultCountry}`;
    } else {
      await propertiesService.update(id, {
        geocode_failed_reason: 'missing_address',
        geocode_provider: null,
        geocode_confidence: null,
      }).catch((err) => {
        console.warn('[ensurePropertyHasCoords] update failed (missing_address):', err);
      });
      return;
    }

    q = q.trim().replace(/\s+/g, ' ');
    if (q.length < 3) {
      await propertiesService.update(id, {
        geocode_failed_reason: 'query_too_short',
        geocode_provider: null,
        geocode_confidence: null,
      }).catch((err) => {
        console.warn('[ensurePropertyHasCoords] update failed (query_too_short):', err);
      });
      return;
    }

    const res = await fetch(`/api/mapbox/geocode?q=${encodeURIComponent(q)}&limit=1`);
    if (!res.ok) {
      console.warn('[ensurePropertyHasCoords] fetch not ok:', res.status);
      await propertiesService.update(id, { geocode_failed_reason: 'fetch_error' }).catch((err) => {
        console.warn('[ensurePropertyHasCoords] update failed (fetch_error):', err);
      });
      return;
    }

    let data: Array<{ label?: string; lat?: number; lng?: number }>;
    try {
      data = await res.json();
    } catch (parseErr) {
      console.warn('[ensurePropertyHasCoords] JSON parse error:', parseErr);
      await propertiesService.update(id, {
        geocode_failed_reason: 'bad_response',
        geocode_provider: null,
        geocode_confidence: null,
      }).catch((err) => {
        console.warn('[ensurePropertyHasCoords] update failed (bad_response):', err);
      });
      return;
    }

    if (!Array.isArray(data) || data.length === 0) {
      await propertiesService.update(id, {
        geocoded_at: new Date().toISOString(),
        geocode_failed_reason: 'no_results',
      }).catch((err) => {
        console.warn('[ensurePropertyHasCoords] update failed (no_results):', err);
      });
      return;
    }

    const first = data[0];
    const lat = first?.lat;
    const lng = first?.lng;
    const valid =
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      !(lat === 0 && lng === 0) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180;

    if (!valid) {
      await propertiesService.update(id, {
        geocoded_at: new Date().toISOString(),
        geocode_failed_reason: 'invalid_coords',
      }).catch((err) => {
        console.warn('[ensurePropertyHasCoords] update failed (invalid_coords):', err);
      });
      return;
    }

    await propertiesService.update(id, {
      lat: lat as number,
      lng: lng as number,
      geocoded_at: new Date().toISOString(),
      geocode_provider: 'mapbox',
      geocode_confidence: 'limit1',
      geocode_failed_reason: null,
    }).catch((err) => {
      console.warn('[ensurePropertyHasCoords] update failed (success path):', err);
    });
  } catch (err) {
    console.warn('[ensurePropertyHasCoords] unexpected error:', err);
  }
}
