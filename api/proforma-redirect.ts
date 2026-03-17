/**
 * GET /api/proforma-redirect?number=PRO-2026-04801
 * Resolves proforma by invoice_number, extracts storage path from file_url,
 * generates a signed URL for the PDF, and redirects (302). Returns 404 if not found or malformed.
 */

import { createClient } from '@supabase/supabase-js';

const BUCKET = 'invoice-pdfs';
const SIGNED_URL_EXPIRY_SEC = 600;

function notFound(): Response {
  return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
}

/** Extract storage path from Supabase public URL: .../object/public/invoice-pdfs/<path> */
function extractStoragePathFromFileUrl(fileUrl: string | null | undefined): string | null {
  if (!fileUrl || typeof fileUrl !== 'string') return null;
  const trimmed = fileUrl.trim();
  if (!trimmed) return null;
  const marker = 'invoice-pdfs/';
  const idx = trimmed.indexOf(marker);
  if (idx === -1) return null;
  const after = trimmed.slice(idx + marker.length);
  const path = after.split('?')[0].split('#')[0].trim();
  return path.length > 0 ? path : null;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const number = url.searchParams.get('number')?.trim();
    if (!number) return notFound();

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      console.error('[proforma-redirect] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      return notFound();
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: row, error } = await supabase
      .from('invoices')
      .select('file_url')
      .eq('invoice_number', number)
      .eq('document_type', 'proforma')
      .maybeSingle();

    if (error) {
      console.error('[proforma-redirect] DB error:', error.message);
      return notFound();
    }
    if (!row?.file_url) return notFound();

    const path = extractStoragePathFromFileUrl(row.file_url);
    if (!path) {
      console.error('[proforma-redirect] Could not extract path from file_url');
      return notFound();
    }

    const { data: signed, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_EXPIRY_SEC);

    if (signErr || !signed?.signedUrl) {
      console.error('[proforma-redirect] Signed URL error:', signErr?.message);
      return notFound();
    }

    return new Response(null, {
      status: 302,
      headers: { Location: signed.signedUrl },
    });
  } catch (e) {
    console.error('[proforma-redirect]', e);
    return notFound();
  }
}
