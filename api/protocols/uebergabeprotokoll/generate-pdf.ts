/**
 * POST /api/protocols/uebergabeprotokoll/generate-pdf
 * Body: { bookingId: string, propertyId: string }
 * Returns: { pdfUrl: string, warning?: string }
 * Generates Guest Übergabeprotokoll as PDF (DOCX → HTML → PDF), uploads to property-documents, returns signed URL.
 * Uses Node runtime. Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from '@supabase/supabase-js';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import mammoth from 'mammoth';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { getProtocolData } from './shared';

const TEMPLATE_BUCKET = 'templates';
const TEMPLATE_PATH = 'guest/uebergabeprotokoll/v1/template.docx';
const OUTPUT_BUCKET = 'property-documents';
const SIGNED_URL_EXPIRY_SEC = 600;

function wrapHtmlForPdf(innerHtml: string): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.4; color: #222; margin: 0; padding: 12mm; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 1em; }
    td, th { border: 1px solid #333; padding: 4px 8px; text-align: left; }
    th { background: #f0f0f0; font-weight: 600; }
    @media print { body { padding: 0; } }
    @page { size: A4; margin: 15mm; }
  </style>
</head>
<body>
${innerHtml}
</body>
</html>`;
}

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
    if (!supabaseUrl || !serviceKey) {
      console.error('[generate-pdf] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      return jsonResponse({ error: 'Server configuration error' }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    let protocolData;
    try {
      protocolData = await getProtocolData(supabase, String(bookingId), String(propertyId));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      console.error('[generate-pdf] getProtocolData failed:', e);
      const status = msg === 'Booking not found' || msg === 'Property not found' ? 404 : 500;
      return jsonResponse({ error: msg }, status);
    }

    const { placeholders, warning, checkInLabel } = protocolData;

    const { data: templateBlob, error: downloadErr } = await supabase.storage
      .from(TEMPLATE_BUCKET)
      .download(TEMPLATE_PATH);

    if (downloadErr || !templateBlob) {
      console.error('[generate-pdf] Template download failed:', downloadErr);
      return jsonResponse({ error: 'Template not found in storage.' }, 502);
    }

    let outDocxBuffer: Buffer;
    try {
      const templateBuffer = Buffer.from(await templateBlob.arrayBuffer());
      const zip = new PizZip(templateBuffer);
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: { start: '{{', end: '}}' },
      });
      doc.render(placeholders);
      outDocxBuffer = doc.getZip().generate({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 },
      }) as Buffer;
    } catch (e) {
      console.error('[generate-pdf] Docx render failed:', e);
      return jsonResponse({ error: e instanceof Error ? e.message : 'Failed to render document' }, 500);
    }

    let fullHtml: string;
    try {
      const { value: html } = await mammoth.convertToHtml({ buffer: outDocxBuffer });
      fullHtml = wrapHtmlForPdf(html);
    } catch (e) {
      console.error('[generate-pdf] Mammoth convertToHtml failed:', e);
      return jsonResponse({ error: e instanceof Error ? e.message : 'Failed to convert document to HTML' }, 500);
    }

    let pdfBuffer: Buffer;
    let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
    try {
      const executablePath = await chromium.executablePath();
      browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: null,
        executablePath,
        headless: true,
      });
      const page = await browser.newPage();
      await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
      pdfBuffer = (await page.pdf({
        format: 'A4',
        printBackground: true,
      })) as Buffer;
    } catch (e) {
      console.error('[generate-pdf] Puppeteer/Chromium failed:', e);
      return jsonResponse({
        error: e instanceof Error ? e.message : 'Failed to generate PDF',
      }, 500);
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch (closeErr) {
          console.error('[generate-pdf] Browser close error:', closeErr);
        }
      }
    }

    const pdfPath = `properties/${propertyId}/bookings/${bookingId}/uebergabeprotokoll_${checkInLabel}.pdf`;

    const { error: uploadErr } = await supabase.storage
      .from(OUTPUT_BUCKET)
      .upload(pdfPath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadErr) {
      console.error('[generate-pdf] Storage upload failed:', uploadErr);
      return jsonResponse({ error: 'Failed to save PDF: ' + uploadErr.message }, 500);
    }

    const { data: signed, error: signErr } = await supabase.storage
      .from(OUTPUT_BUCKET)
      .createSignedUrl(pdfPath, SIGNED_URL_EXPIRY_SEC);

    if (signErr || !signed?.signedUrl) {
      console.error('[generate-pdf] Signed URL failed:', signErr);
      return jsonResponse({ error: 'Failed to create download link' }, 500);
    }

    const response: { pdfUrl: string; warning?: string } = { pdfUrl: signed.signedUrl };
    if (warning) response.warning = warning;

    return jsonResponse(response, 200);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal error';
    console.error('[generate-pdf] Unhandled error:', e);
    return jsonResponse({ error: message }, 500);
  }
}

export const config = { runtime: 'nodejs' };
