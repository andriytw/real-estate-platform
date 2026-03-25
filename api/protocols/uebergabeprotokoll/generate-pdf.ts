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
import { getProtocolData } from './shared.js';

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
      console.error('[uebergabe][' + stageRender + ']', e);
      return jsonResponse({
        error: e instanceof Error ? e.message : 'Failed to render document',
        stage: stageRender,
      }, 500);
    }

    const stageConvert = 'convert_html';
    let fullHtml: string;
    try {
      const { value: html } = await mammoth.convertToHtml({ buffer: outDocxBuffer });
      fullHtml = wrapHtmlForPdf(html);
    } catch (e) {
      console.error('[uebergabe][' + stageConvert + ']', e);
      return jsonResponse({
        error: e instanceof Error ? e.message : 'Failed to convert document to HTML',
        stage: stageConvert,
      }, 500);
    }

    const stageLaunch = 'launch_chromium';
    let pdfBuffer: Buffer | undefined;
    let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
    try {
      const executablePath = await chromium.executablePath();
      if (!executablePath) {
        throw new Error('Chromium executablePath is empty');
      }
      browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: null,
        executablePath,
        headless: true,
      });
      const page = await browser.newPage();
      await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
      const stagePdf = 'render_pdf';
      try {
        pdfBuffer = (await page.pdf({
          format: 'A4',
          printBackground: true,
        })) as Buffer;
      } catch (e) {
        console.error('[uebergabe][' + stagePdf + ']', e);
        return jsonResponse({
          error: e instanceof Error ? e.message : 'Failed to generate PDF',
          stage: stagePdf,
        }, 500);
      }
    } catch (e) {
      console.error('[uebergabe][' + stageLaunch + ']', e);
      return jsonResponse({
        error: e instanceof Error ? e.message : 'Failed to launch Chromium',
        stage: stageLaunch,
      }, 500);
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch (closeErr) {
          console.error('[uebergabe][launch_chromium] close error:', closeErr);
        }
      }
    }

    if (pdfBuffer == null) {
      console.error('[uebergabe][render_pdf] pdfBuffer missing');
      return jsonResponse({ error: 'PDF buffer missing', stage: 'render_pdf' }, 500);
    }

    const pdfPath = `properties/${propertyId}/bookings/${bookingId}/uebergabeprotokoll_${checkInLabel}.pdf`;

    const stageUpload = 'upload_pdf';
    try {
      const { error: uploadErr } = await supabase.storage
        .from(OUTPUT_BUCKET)
        .upload(pdfPath, pdfBuffer, {
          contentType: 'application/pdf',
          upsert: true,
        });
      if (uploadErr) throw uploadErr;
    } catch (e) {
      console.error('[uebergabe][' + stageUpload + ']', e);
      return jsonResponse({
        error: e instanceof Error ? e.message : 'Failed to save PDF',
        stage: stageUpload,
      }, 500);
    }

    const stageSign = 'sign_url';
    try {
      const { data: signed, error: signErr } = await supabase.storage
        .from(OUTPUT_BUCKET)
        .createSignedUrl(pdfPath, SIGNED_URL_EXPIRY_SEC);
      if (signErr || !signed?.signedUrl) {
        throw new Error(signErr?.message ?? 'No signed URL');
      }
      const response: { pdfUrl: string; warning?: string } = { pdfUrl: signed.signedUrl };
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

export const config = { runtime: 'nodejs' };
