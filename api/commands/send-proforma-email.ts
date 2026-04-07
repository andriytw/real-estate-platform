/**
 * POST /api/commands/send-proforma-email
 * Body: { "invoiceId": "<uuid>" } only.
 * Loads proforma from DB, recipient from offer (primary) or reservation (fallback),
 * downloads PDF from Storage, sends via Resend.
 */

import { Resend } from 'resend';
import { getSupabaseAdmin } from '../_lib/supabase-admin.js';
import { withTimeout } from '../_lib/with-timeout.js';
import {
  requireCommandProfile,
  assertCanSaveInvoice,
  CommandAuthError,
} from '../_lib/command-auth.js';
import { resolveIdempotency, completeIdempotency, failIdempotency } from '../_lib/idempotency.js';
import { extractInvoicePdfStoragePath } from '../_lib/storagePaths.js';
import {
  normalizeCommandError,
  commandErrorResponseBody,
} from '../_lib/normalize-command-error.js';

const LOG_PREFIX = '[send-proforma-email]';
const BUCKET = 'invoice-pdfs';
const DB_TIMEOUT_MS = 25_000;
const STORAGE_DOWNLOAD_MS = 60_000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function formatEuropeanDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const s = String(iso).slice(0, 10);
  const parts = s.split('-');
  if (parts.length !== 3) return s;
  const [y, m, day] = parts;
  if (!y || !m || !day) return s;
  return `${String(day).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;
}

function sanitizePdfFilename(invoiceNumber: string): string {
  const safe = String(invoiceNumber || 'proforma').replace(/[^\w.\-]+/g, '_').slice(0, 120);
  return safe.toLowerCase().endsWith('.pdf') ? safe : `${safe}.pdf`;
}

function maskRecipientForLog(email: string): string {
  const t = email.trim();
  const at = t.indexOf('@');
  if (at <= 0) return '(invalid)';
  const domain = t.slice(at + 1);
  return `***@${domain}`;
}

export async function POST(request: Request) {
  let idemRowId: string | null = null;
  const admin = getSupabaseAdmin();

  try {
    const profile = await requireCommandProfile(request);
    assertCanSaveInvoice(profile);

    const idemKey = request.headers.get('x-idempotency-key')?.trim();
    if (!idemKey) {
      return json({ error: 'Missing X-Idempotency-Key header' }, 400);
    }

    const body = (await request.json()) as { invoiceId?: unknown };
    const invoiceIdRaw = body?.invoiceId != null ? String(body.invoiceId).trim() : '';
    if (!invoiceIdRaw || !UUID_RE.test(invoiceIdRaw)) {
      return json({ error: 'Missing or invalid invoiceId' }, 400);
    }

    const idem = await resolveIdempotency(admin, profile.id, 'send-proforma-email', idemKey);
    if (idem.kind === 'replay') {
      return json(idem.result, 200);
    }
    if (idem.kind === 'conflict') {
      return json({ error: idem.message }, 409);
    }
    idemRowId = idem.rowId;

    const { data: invRow, error: invErr } = await withTimeout(
      admin
        .from('invoices')
        .select(
          'id, invoice_number, client_name, total_gross, offer_id, file_url, document_type, reservation_id'
        )
        .eq('id', invoiceIdRaw)
        .maybeSingle(),
      DB_TIMEOUT_MS,
      'load invoice'
    );

    if (invErr) {
      console.error(`${LOG_PREFIX} db invoice`, { message: invErr.message });
      await failIdempotency(admin, idemRowId, invErr.message);
      return json({ error: 'Failed to load invoice' }, 500);
    }
    if (!invRow) {
      await failIdempotency(admin, idemRowId, 'Invoice not found');
      return json({ error: 'Invoice not found' }, 404);
    }

    const docType = String(invRow.document_type || '').toLowerCase();
    if (docType !== 'proforma') {
      await failIdempotency(admin, idemRowId, 'Not a proforma document');
      return json({ error: 'Invoice is not a proforma' }, 400);
    }

    const invoiceNumber = String(invRow.invoice_number || '').trim();
    const fileUrl = invRow.file_url != null ? String(invRow.file_url).trim() : '';
    if (!fileUrl) {
      console.error(`${LOG_PREFIX} missing file_url`, { invoiceId: invoiceIdRaw, invoiceNumber });
      await failIdempotency(admin, idemRowId, 'Proforma has no stored PDF');
      return json(
        { error: 'Failed to attach proforma PDF to email. No proforma file on record.' },
        422
      );
    }

    const storagePath = extractInvoicePdfStoragePath(fileUrl);
    if (!storagePath) {
      console.error(`${LOG_PREFIX} path extract failed`, {
        invoiceId: invoiceIdRaw,
        invoiceNumber,
        reason: 'could_not_extract_storage_path',
      });
      await failIdempotency(admin, idemRowId, 'Could not resolve storage path');
      return json({ error: 'Failed to attach proforma PDF to email. Invalid file URL.' }, 422);
    }

    let recipientEmail: string | null = null;
    let clientNameForGreeting = String(invRow.client_name || 'Guest').trim() || 'Guest';
    let startDateStr = '';
    let endDateStr = '';

    const offerId = invRow.offer_id != null ? String(invRow.offer_id) : '';
    if (offerId && UUID_RE.test(offerId)) {
      const { data: offerRow, error: offErr } = await withTimeout(
        admin
          .from('offers')
          .select('email, client_name, start_date, end_date')
          .eq('id', offerId)
          .maybeSingle(),
        DB_TIMEOUT_MS,
        'load offer'
      );
      if (offErr) {
        console.error(`${LOG_PREFIX} db offer`, { message: offErr.message });
      } else if (offerRow) {
        if (offerRow.email != null && String(offerRow.email).trim()) {
          recipientEmail = String(offerRow.email).trim();
        }
        if (offerRow.client_name != null && String(offerRow.client_name).trim()) {
          clientNameForGreeting = String(offerRow.client_name).trim();
        }
        if (offerRow.start_date) startDateStr = String(offerRow.start_date).slice(0, 10);
        if (offerRow.end_date) endDateStr = String(offerRow.end_date).slice(0, 10);
      }
    }

    const resId = invRow.reservation_id != null ? String(invRow.reservation_id) : '';
    if (!recipientEmail && resId && UUID_RE.test(resId)) {
      const { data: resRow, error: resErr } = await withTimeout(
        admin
          .from('reservations')
          .select('client_email, client_first_name, client_last_name, start_date, end_date')
          .eq('id', resId)
          .maybeSingle(),
        DB_TIMEOUT_MS,
        'load reservation'
      );
      if (resErr) {
        console.error(`${LOG_PREFIX} db reservation`, { message: resErr.message });
      } else if (resRow) {
        if (resRow.client_email != null && String(resRow.client_email).trim()) {
          recipientEmail = String(resRow.client_email).trim();
        }
        const fn = resRow.client_first_name != null ? String(resRow.client_first_name).trim() : '';
        const ln = resRow.client_last_name != null ? String(resRow.client_last_name).trim() : '';
        const combined = [fn, ln].filter(Boolean).join(' ').trim();
        if (combined) clientNameForGreeting = combined;
        if (!startDateStr && resRow.start_date) startDateStr = String(resRow.start_date).slice(0, 10);
        if (!endDateStr && resRow.end_date) endDateStr = String(resRow.end_date).slice(0, 10);
      }
    }

    if (!recipientEmail) {
      console.error(`${LOG_PREFIX} no recipient`, { invoiceId: invoiceIdRaw, invoiceNumber });
      await failIdempotency(admin, idemRowId, 'No recipient email');
      return json(
        {
          error:
            'No recipient email on file for this proforma. Add email on the linked offer or reservation.',
        },
        422
      );
    }

    const { data: dl, error: dlErr } = await withTimeout(
      admin.storage.from(BUCKET).download(storagePath),
      STORAGE_DOWNLOAD_MS,
      'storage download proforma pdf'
    );

    if (dlErr || !dl) {
      const norm = normalizeCommandError(dlErr);
      console.error(`${LOG_PREFIX} storage download failed`, {
        invoiceId: invoiceIdRaw,
        invoiceNumber,
        storagePath,
        reason: 'storage_download',
        ...commandErrorResponseBody(norm),
      });
      await failIdempotency(admin, idemRowId, norm.message);
      return json(
        { error: 'Failed to attach proforma PDF to email. Could not load file from storage.' },
        500
      );
    }

    const ab = await dl.arrayBuffer();
    if (!ab.byteLength) {
      console.error(`${LOG_PREFIX} empty file`, { invoiceId: invoiceIdRaw, invoiceNumber, storagePath });
      await failIdempotency(admin, idemRowId, 'Empty PDF');
      return json({ error: 'Failed to attach proforma PDF to email. Stored file is empty.' }, 500);
    }

    const pdfBuffer = Buffer.from(ab);

    const d1 = formatEuropeanDate(startDateStr);
    const d2 = formatEuropeanDate(endDateStr);
    const datesLine = d1 && d2 ? `${d1} – ${d2}` : d1 || d2 ? `${d1 || d2}` : 'your stay';

    const totalGross =
      invRow.total_gross != null && Number.isFinite(Number(invRow.total_gross))
        ? Number(invRow.total_gross)
        : 0;
    const totalStr = totalGross.toFixed(2);

    const textBody = [
      `Hello ${clientNameForGreeting},`,
      '',
      'Please find attached the proforma invoice for your stay.',
      '',
      `Stay: ${datesLine}`,
      `Proforma: ${invoiceNumber}`,
      `Total: €${totalStr}`,
      '',
      'Kind regards',
    ].join('\n');

    const subject = `Proforma ${invoiceNumber}`;

    const resendKey = process.env.RESEND_API_KEY?.trim();
    const fromAddr = process.env.EMAIL_FROM?.trim() || process.env.RESEND_FROM?.trim();
    if (!resendKey || !fromAddr) {
      console.error(`${LOG_PREFIX} missing RESEND_API_KEY or EMAIL_FROM/RESEND_FROM`);
      await failIdempotency(admin, idemRowId, 'Email provider not configured');
      return json(
        { error: 'Failed to attach proforma PDF to email. Email provider not configured.' },
        500
      );
    }

    const resend = new Resend(resendKey);
    const attachmentName = sanitizePdfFilename(`Proforma-${invoiceNumber}`);

    console.log(`${LOG_PREFIX} sending`, {
      invoiceId: invoiceIdRaw,
      invoiceNumber,
      recipient: maskRecipientForLog(recipientEmail),
      storagePath,
      attachmentName,
    });

    const sendResult = await resend.emails.send({
      from: fromAddr,
      to: recipientEmail,
      subject,
      text: textBody,
      attachments: [
        {
          filename: attachmentName,
          content: pdfBuffer,
        },
      ],
    });

    if (sendResult.error) {
      const errMsg = sendResult.error.message || 'Resend error';
      console.error(`${LOG_PREFIX} resend error`, {
        invoiceId: invoiceIdRaw,
        invoiceNumber,
        reason: 'provider',
        message: errMsg,
      });
      await failIdempotency(admin, idemRowId, errMsg);
      return json({ error: 'Failed to attach proforma PDF to email. Provider rejected send.' }, 502);
    }

    const providerId = sendResult.data?.id ?? null;
    console.log(`${LOG_PREFIX} ok`, {
      invoiceId: invoiceIdRaw,
      invoiceNumber,
      recipient: maskRecipientForLog(recipientEmail),
      storagePath,
      providerMessageId: providerId,
    });

    const payload = { ok: true as const, providerMessageId: providerId };
    await completeIdempotency(admin, idemRowId, payload);
    return json(payload, 200);
  } catch (e) {
    const norm = normalizeCommandError(e);
    if (e instanceof CommandAuthError) {
      return json({ error: e.message }, e.status);
    }
    console.error(`${LOG_PREFIX} fatal`, commandErrorResponseBody(norm));
    if (idemRowId) {
      await failIdempotency(admin, idemRowId, norm.message).catch(() => {});
    }
    return json({ error: norm.message || 'Request failed' }, 500);
  }
}
