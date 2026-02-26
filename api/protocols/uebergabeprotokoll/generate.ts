/**
 * POST /api/protocols/uebergabeprotokoll/generate
 * Body: { bookingId: string, propertyId: string }
 * Returns: { url: string, warning?: string }
 * Generates Guest Übergabeprotokoll DOCX from template, uploads to property-documents, returns signed URL.
 */

import { createClient } from '@supabase/supabase-js';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { getProtocolData } from './shared.js';

const TEMPLATE_BUCKET = 'templates';
const TEMPLATE_PATH = 'guest/uebergabeprotokoll/v1/template.docx';
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
    if (!bookingId || !propertyId) {
      return jsonResponse({ error: 'Missing bookingId or propertyId' }, 400);
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const missing: string[] = [];
    if (!supabaseUrl) missing.push('SUPABASE_URL');
    if (!serviceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    if (missing.length > 0) {
      console.error('[uebergabe][env] Missing:', missing);
      return jsonResponse({
        error: 'Missing env: ' + missing.join(', '),
        missing,
      }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    let protocolData;
    const stageFetch = 'fetch_data';
    try {
      protocolData = await getProtocolData(supabase, String(bookingId), String(propertyId));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      console.error('[uebergabe][' + stageFetch + ']', e);
      const status = msg === 'Booking not found' || msg === 'Property not found' ? 404 : 500;
      return jsonResponse({ error: msg, stage: stageFetch }, status);
    }

    const { placeholders, warning, checkInLabel } = protocolData;

    const stageDownload = 'download_template';
    let templateBlob: Blob;
    try {
      const { data, error: downloadErr } = await supabase.storage
        .from(TEMPLATE_BUCKET)
        .download(TEMPLATE_PATH);
      if (downloadErr || !data) {
        throw new Error(downloadErr?.message ?? 'Template not found');
      }
      templateBlob = data;
    } catch (e) {
      console.error('[uebergabe][' + stageDownload + ']', e);
      return jsonResponse({
        error: e instanceof Error ? e.message : 'Template not found in storage.',
        stage: stageDownload,
      }, 502);
    }

    const stageRender = 'render_docx';
    let outBuffer: Buffer;
    try {
      const templateBuffer = Buffer.from(await templateBlob.arrayBuffer());
      const zip = new PizZip(templateBuffer);
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: { start: '{{', end: '}}' },
      });
      doc.render(placeholders);
      outBuffer = doc.getZip().generate({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 },
      }) as Buffer;
    } catch (e) {
      console.error('[uebergabe][' + stageRender + ']', e);
      return jsonResponse({
        error: e instanceof Error ? e.message : 'Failed to render document',
        stage: stageRender,
      }, 500);
    }

    const outputPath = `properties/${propertyId}/bookings/${bookingId}/uebergabeprotokoll_${checkInLabel}.docx`;

    const stageUpload = 'upload_docx';
    try {
      const { error: uploadErr } = await supabase.storage
        .from(OUTPUT_BUCKET)
        .upload(outputPath, outBuffer, {
          contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          upsert: true,
        });
      if (uploadErr) throw uploadErr;
    } catch (e) {
      console.error('[uebergabe][' + stageUpload + ']', e);
      return jsonResponse({
        error: e instanceof Error ? e.message : 'Failed to save document',
        stage: stageUpload,
      }, 500);
    }

    const stageSign = 'sign_url';
    try {
      const { data: signed, error: signErr } = await supabase.storage
        .from(OUTPUT_BUCKET)
        .createSignedUrl(outputPath, SIGNED_URL_EXPIRY_SEC);
      if (signErr || !signed?.signedUrl) {
        throw new Error(signErr?.message ?? 'No signed URL');
      }
      const response: { url: string; warning?: string } = { url: signed.signedUrl };
      if (warning) response.warning = warning;
      return jsonResponse(response, 200);
    } catch (e) {
      console.error('[uebergabe][' + stageSign + ']', e);
      return jsonResponse({
        error: e instanceof Error ? e.message : 'Failed to create download link',
        stage: stageSign,
      }, 500);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal error';
    console.error('[uebergabe][unhandled]', e);
    return jsonResponse({ error: message, stage: 'unhandled' }, 500);
  }
}
