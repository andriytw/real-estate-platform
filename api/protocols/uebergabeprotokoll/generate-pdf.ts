/**
 * POST /api/protocols/uebergabeprotokoll/generate-pdf
 * Body: { bookingId: string, propertyId: string }
 * Returns: { pdfUrl: string, docxUrl?: string, warning?: string }
 * Generates Guest Übergabeprotokoll as PDF (DOCX → HTML → PDF), uploads to property-documents, returns signed URL.
 * Uses Node runtime (not Edge). Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
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

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const bookingId = body?.bookingId ?? body?.booking_id;
    const propertyId = body?.propertyId ?? body?.property_id;
    if (!bookingId || !propertyId) {
      return new Response(
        JSON.stringify({ error: 'Missing bookingId or propertyId' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    let protocolData;
    try {
      protocolData = await getProtocolData(supabase, String(bookingId), String(propertyId));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      const status = msg === 'Booking not found' || msg === 'Property not found' ? 404 : 500;
      return new Response(JSON.stringify({ error: msg }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { placeholders, warning, checkInLabel } = protocolData;

    const { data: templateBlob, error: downloadErr } = await supabase.storage
      .from(TEMPLATE_BUCKET)
      .download(TEMPLATE_PATH);

    if (downloadErr || !templateBlob) {
      return new Response(
        JSON.stringify({ error: 'Template not found in storage.' }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const templateBuffer = Buffer.from(await templateBlob.arrayBuffer());
    const zip = new PizZip(templateBuffer);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: '{{', end: '}}' },
    });
    doc.render(placeholders);
    const outDocxBuffer = doc.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
    }) as Buffer;

    const mammothResult = await mammoth.convertToHtml({ buffer: outDocxBuffer });
    const fullHtml = wrapHtmlForPdf(mammothResult.value);

    const executablePath = await chromium.executablePath();
    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath,
      headless: true,
    });

    let pdfBuffer: Buffer;
    try {
      const page = await browser.newPage();
      await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
      pdfBuffer = (await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
      })) as Buffer;
    } finally {
      await browser.close();
    }

    const pdfPath = `properties/${propertyId}/bookings/${bookingId}/uebergabeprotokoll_${checkInLabel}.pdf`;

    const { error: uploadErr } = await supabase.storage
      .from(OUTPUT_BUCKET)
      .upload(pdfPath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadErr) {
      return new Response(
        JSON.stringify({ error: 'Failed to save PDF: ' + uploadErr.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { data: signed, error: signErr } = await supabase.storage
      .from(OUTPUT_BUCKET)
      .createSignedUrl(pdfPath, SIGNED_URL_EXPIRY_SEC);

    if (signErr || !signed?.signedUrl) {
      return new Response(
        JSON.stringify({ error: 'Failed to create download link' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const response: { pdfUrl: string; docxUrl?: string; warning?: string } = { pdfUrl: signed.signedUrl };
    if (warning) response.warning = warning;

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export const config = { runtime: 'nodejs' };
