#!/usr/bin/env node

/**
 * One-time backfill: geocode missing lat/lng for public.properties using Mapbox.
 *
 * Required env (set in shell or source .env before running):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   MAPBOX_SECRET_TOKEN  (or NEXT_PUBLIC_MAPBOX_TOKEN as fallback)
 *
 * Example:
 *   export SUPABASE_URL=https://xxx.supabase.co
 *   export SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *   export MAPBOX_SECRET_TOKEN=pk.eyJ...
 *   node scripts/geocode-missing-properties.js
 *
 * Or: export $(grep -v '^#' .env | xargs) && node scripts/geocode-missing-properties.js
 */

import { createClient } from '@supabase/supabase-js';

const BATCH_SIZE = 50;
const DELAY_MS = 200;
const MAPBOX_GEOCODE = 'https://api.mapbox.com/geocoding/v5/mapbox.places';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const mapboxToken = process.env.MAPBOX_SECRET_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required env: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!mapboxToken) {
  console.error('❌ Missing Mapbox token: set MAPBOX_SECRET_TOKEN or NEXT_PUBLIC_MAPBOX_TOKEN');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function buildQuery(row) {
  const address = (row.address || '').trim();
  const city = (row.city || '').trim();
  if (!address) return '';
  if (city) return `${address}, ${city}, Germany`;
  return `${address}, Germany`;
}

function isValidCoord(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    !(lat === 0 && lng === 0) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function geocode(query) {
  const encoded = encodeURIComponent(query);
  const url = `${MAPBOX_GEOCODE}/${encoded}.json?access_token=${mapboxToken}&limit=1&autocomplete=false`;
  const res = await fetch(url);
  if (!res.ok) return { error: `http ${res.status}` };
  const data = await res.json();
  const features = Array.isArray(data.features) ? data.features : [];
  if (features.length === 0) return { failedReason: 'no_results' };
  const center = features[0].center;
  if (!Array.isArray(center) || center.length < 2) return { failedReason: 'invalid_coords' };
  const [lng, lat] = center;
  if (!isValidCoord(lat, lng)) return { failedReason: 'invalid_coords' };
  return { lat, lng };
}

async function run() {
  let processed = 0;
  let success = 0;
  let failed = 0;
  let offset = 0;

  console.log('Geocode backfill: fetching properties with missing lat/lng…\n');

  while (true) {
    const { data: rows, error } = await supabase
      .from('properties')
      .select('id, title, address, city')
      .or('lat.is.null,lng.is.null')
      .not('address', 'is', null)
      .order('id', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) {
      console.error('❌ Supabase query error:', error.message);
      process.exit(1);
    }
    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      const query = buildQuery(row);
      if (query.length < 3) {
        const { error: updateErr } = await supabase
          .from('properties')
          .update({
            geocoded_at: new Date().toISOString(),
            geocode_provider: 'mapbox',
            geocode_confidence: null,
            geocode_failed_reason: 'query_too_short',
          })
          .eq('id', row.id);
        if (updateErr) console.error('  update error', row.id, updateErr.message);
        failed++;
        processed++;
        continue;
      }

      await sleep(DELAY_MS);
      const result = await geocode(query);

      if (result.failedReason) {
        const { error: updateErr } = await supabase
          .from('properties')
          .update({
            geocoded_at: new Date().toISOString(),
            geocode_provider: 'mapbox',
            geocode_confidence: null,
            geocode_failed_reason: result.failedReason,
          })
          .eq('id', row.id);
        if (updateErr) console.error('  update error', row.id, updateErr.message);
        failed++;
        processed++;
        continue;
      }

      const { error: updateErr } = await supabase
        .from('properties')
        .update({
          lat: result.lat,
          lng: result.lng,
          geocoded_at: new Date().toISOString(),
          geocode_provider: 'mapbox',
          geocode_confidence: 'limit1',
          geocode_failed_reason: null,
        })
        .eq('id', row.id);

      if (updateErr) {
        console.error('  update error', row.id, updateErr.message);
        failed++;
      } else {
        success++;
      }
      processed++;
    }

    console.log(`  processed ${processed} (ok: ${success}, failed: ${failed})`);
    if (rows.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  console.log('\nDone. Processed:', processed, 'Success:', success, 'Failed:', failed);
}

run().catch((err) => {
  console.error('❌ Fatal:', err);
  process.exit(1);
});
