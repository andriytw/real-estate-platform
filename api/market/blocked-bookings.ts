/**
 * Vercel serverless: GET /api/market/blocked-bookings?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns { property_ids: string[] } blocked by bookings (overlap: start_date < to AND end_date > from).
 * Uses SUPABASE_SERVICE_ROLE_KEY (server-only). Cache-Control: s-maxage=30, stale-while-revalidate=120.
 */

import { createClient } from '@supabase/supabase-js';

const YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(s: string): boolean {
  if (!YYYY_MM_DD.test(s)) return false;
  const t = new Date(s + 'T12:00:00Z').getTime();
  return Number.isFinite(t);
}

function emptyResponse(): Response {
  return new Response(JSON.stringify({ property_ids: [] }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 's-maxage=30, stale-while-revalidate=120',
    },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const from = url.searchParams.get('from')?.trim().slice(0, 10) ?? '';
  const to = url.searchParams.get('to')?.trim().slice(0, 10) ?? '';

  if (!from || !to || !isValidDate(from) || !isValidDate(to) || from >= to) {
    return emptyResponse();
  }

  const fromDate = new Date(from + 'T12:00:00Z');
  const toDate = new Date(to + 'T12:00:00Z');
  const diffMs = toDate.getTime() - fromDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays > 60) {
    return emptyResponse();
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return emptyResponse();
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data, error } = await supabase
    .from('bookings')
    .select('property_id')
    .lt('start_date', to)
    .gt('end_date', from);

  if (error) {
    return emptyResponse();
  }

  const ids = Array.from(
    new Set(
      (data || [])
        .map((row: { property_id?: string | null }) => row?.property_id)
        .filter((id): id is string => id != null && String(id).trim() !== '')
        .map((id) => String(id).trim())
    )
  );

  return new Response(JSON.stringify({ property_ids: ids }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 's-maxage=30, stale-while-revalidate=120',
    },
  });
}
