/**
 * Vercel serverless: GET /api/mapbox/geocode?q=...&limit=...
 * Mapbox forward geocoding. Uses process.env only (no client env).
 */

import { mapboxGeocodeSuggestionFromFeature } from '../../utils/mapboxAddressFromFeature.js';

const MAPBOX_GEOCODE = 'https://api.mapbox.com/geocoding/v5/mapbox.places';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim() ?? '';
  const limit = Math.min(10, Math.max(1, parseInt(url.searchParams.get('limit') ?? '5', 10) || 5));

  if (q.length < 3) {
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
      },
    });
  }

  const token = process.env.MAPBOX_SECRET_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) {
    return new Response(JSON.stringify({ error: 'Mapbox token not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoded = encodeURIComponent(q);
  const apiUrl = `${MAPBOX_GEOCODE}/${encoded}.json?access_token=${token}&limit=${limit}`;

  try {
    const res = await fetch(apiUrl);
    if (!res.ok) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
        },
      });
    }
    const data = await res.json();
    const features = Array.isArray(data.features) ? data.features : [];
    const suggestions = features.slice(0, limit).map((f: unknown) => mapboxGeocodeSuggestionFromFeature(f));

    return new Response(JSON.stringify(suggestions), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch {
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
      },
    });
  }
}
