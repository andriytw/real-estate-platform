/**
 * POST /api/protocols/uebergabeprotokoll/get-url
 * Body: { bookingId: string, propertyId: string, format: "docx" }
 * Returns: { url: string, warning?: string }
 * Returns signed URL for existing DOCX or generates it then returns URL. DOCX only.
 */

import { createClient } from '@supabase/supabase-js';
import { formatDDMMYYYY } from './shared.js';
import { generateDocxAndReturnUrl } from './generate.js';

const OUTPUT_BUCKET = 'property-documents';
const SIGNED_URL_EXPIRY_SEC = 600;

function jsonResponse(body: object, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const bookingId = body?.bookingId ?? body?.booking_id;
    const propertyId = body?.propertyId ?? body?.property_id;
    const format = body?.format;

    if (!bookingId || !propertyId) {
      return jsonResponse({ error: 'Missing bookingId or propertyId' }, 400);
    }
    if (format !== 'docx') {
      return jsonResponse({ error: 'format must be "docx"' }, 400);
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const missing: string[] = [];
    if (!supabaseUrl) missing.push('SUPABASE_URL');
    if (!serviceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    if (missing.length > 0) {
      console.error('[uebergabe][get-url] Missing env:', missing);
      return jsonResponse({
        error: 'Missing env: ' + missing.join(', '),
        missing,
      }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: bookingRow, error: bookingErr } = await supabase
      .from('bookings')
      .select('start_date')
      .eq('id', String(bookingId))
      .single();

    if (bookingErr || !bookingRow) {
      console.error('[uebergabe][get-url] Booking not found:', bookingId, bookingErr);
      return jsonResponse({ error: 'Booking not found' }, 404);
    }

    const startDate = (bookingRow as { start_date?: string }).start_date;
    const checkInLabel = formatDDMMYYYY(String(startDate ?? '')) || 'document';
    const fileName = `uebergabeprotokoll_${checkInLabel}.docx`;
    const folderPath = `properties/${propertyId}/bookings/${bookingId}`;
    const fullPath = `${folderPath}/${fileName}`;

    const { data: listData, error: listErr } = await supabase.storage
      .from(OUTPUT_BUCKET)
      .list(folderPath);

    if (!listErr && listData && Array.isArray(listData)) {
      const exists = listData.some((item: { name?: string }) => item.name === fileName);
      if (exists) {
        const { data: signed, error: signErr } = await supabase.storage
          .from(OUTPUT_BUCKET)
          .createSignedUrl(fullPath, SIGNED_URL_EXPIRY_SEC);
        if (!signErr && signed?.signedUrl) {
          return jsonResponse({ url: signed.signedUrl }, 200);
        }
        console.error('[uebergabe][get-url] Signed URL failed for existing file:', signErr);
      }
    }

    const result = await generateDocxAndReturnUrl(supabase, String(bookingId), String(propertyId));
    return jsonResponse(result, 200);
  } catch (e) {
    const err = e as Error & { stage?: string };
    console.error('[uebergabe][get-url]', err);
    return jsonResponse({
      error: err.message,
      ...(err.stage && { stage: err.stage }),
    }, 500);
  }
}
