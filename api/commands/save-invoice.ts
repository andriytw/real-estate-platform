import { getSupabaseAdmin } from '../_lib/supabase-admin';
import { withTimeout } from '../_lib/with-timeout';
import {
  requireCommandProfile,
  assertCanSaveInvoice,
  CommandAuthError,
} from '../_lib/command-auth';
import { resolveIdempotency, completeIdempotency, failIdempotency } from '../_lib/idempotency';
import { transformInvoiceFromDB, transformInvoiceToDB } from '../_lib/commandDb';

const BUCKET = 'invoice-pdfs';
const UPLOAD_TIMEOUT_MS = 90_000;
const DB_TIMEOUT_MS = 25_000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function uploadPdf(
  admin: ReturnType<typeof getSupabaseAdmin>,
  fileBytes: ArrayBuffer,
  pathPrefix: string
): Promise<{ publicUrl: string; path: string }> {
  const safeName = `${Date.now()}-${crypto.randomUUID()}.pdf`;
  const path = pathPrefix ? `${pathPrefix}/${safeName}` : safeName;
  const { error } = await withTimeout(
    admin.storage.from(BUCKET).upload(path, fileBytes, {
      contentType: 'application/pdf',
      upsert: false,
      cacheControl: '3600',
    }),
    UPLOAD_TIMEOUT_MS,
    'storage upload invoice pdf'
  );
  if (error) throw new Error(error.message || 'Storage upload failed');
  const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(path);
  return { publicUrl: urlData.publicUrl, path };
}

async function removeStoragePaths(admin: ReturnType<typeof getSupabaseAdmin>, paths: string[]): Promise<void> {
  if (!paths.length) return;
  await admin.storage.from(BUCKET).remove(paths);
}

async function resolveOfferIdSource(
  admin: ReturnType<typeof getSupabaseAdmin>,
  offerIdSource: string | undefined | null
): Promise<string | null> {
  if (!offerIdSource) return null;
  const id = String(offerIdSource);
  if (!UUID_RE.test(id)) return null;
  const { data } = await withTimeout(
    admin.from('offers').select('id').eq('id', id).maybeSingle(),
    DB_TIMEOUT_MS,
    'verify offerIdSource'
  );
  return data?.id ? String(data.id) : null;
}

async function updateOfferItemOnProformaSave(
  admin: ReturnType<typeof getSupabaseAdmin>,
  offerItemId: string | undefined | null,
  invoiceId: string
): Promise<void> {
  if (!offerItemId || !UUID_RE.test(String(offerItemId))) return;
  await withTimeout(
    admin.from('offer_items').update({
      status: 'Converted',
      converted_at: new Date().toISOString(),
      invoice_id: invoiceId,
    }).eq('id', String(offerItemId)),
    DB_TIMEOUT_MS,
    'update offer_item status'
  );
}

export async function POST(request: Request) {
  let uploadedPath: string | null = null;
  let pendingInvoiceId: string | null = null;
  try {
    const profile = await requireCommandProfile(request);
    assertCanSaveInvoice(profile);

    const idemKey = request.headers.get('x-idempotency-key')?.trim();
    if (!idemKey) {
      return json({ error: 'Missing X-Idempotency-Key header' }, 400);
    }

    const ct = request.headers.get('content-type') || '';
    let invoice: Record<string, unknown>;
    let mode = 'save';
    let file: File | null = null;
    let offerItemId: string | undefined;

    if (ct.includes('multipart/form-data')) {
      const form = await request.formData();
      const raw = form.get('invoice');
      if (!raw || typeof raw !== 'string') {
        return json({ error: 'Missing invoice JSON in form data' }, 400);
      }
      invoice = JSON.parse(raw) as Record<string, unknown>;
      mode = String(form.get('mode') || 'save');
      offerItemId = form.get('offerItemId') ? String(form.get('offerItemId')) : undefined;
      const f = form.get('file');
      file = f instanceof File && f.size > 0 ? f : null;
    } else {
      const body = (await request.json()) as {
        invoice?: Record<string, unknown>;
        mode?: string;
        offerItemId?: string;
      };
      if (!body.invoice) {
        return json({ error: 'Missing invoice in body' }, 400);
      }
      invoice = body.invoice;
      mode = body.mode || 'save';
      offerItemId = body.offerItemId;
    }

    const admin = getSupabaseAdmin();
    const idem = await resolveIdempotency(admin, profile.id, 'save-invoice', idemKey);
    if (idem.kind === 'replay') {
      return json(idem.result, 200);
    }
    if (idem.kind === 'conflict') {
      return json({ error: idem.message }, 409);
    }

    try {
      const rawId = invoice.id != null ? String(invoice.id) : '';
      let isUpdate = false;
      if (rawId && UUID_RE.test(rawId)) {
        const { data: existing } = await withTimeout(
          admin.from('invoices').select('id').eq('id', rawId).maybeSingle(),
          DB_TIMEOUT_MS, 'check existing invoice'
        );
        isUpdate = !!existing;
      }

      const verifiedOfferId = await resolveOfferIdSource(
        admin,
        invoice.offerIdSource != null ? String(invoice.offerIdSource) : undefined
      );
      if (verifiedOfferId) {
        invoice.offerIdSource = verifiedOfferId;
      } else {
        invoice.offerIdSource = undefined;
      }

      const docType = String(invoice.documentType || 'proforma');
      const prefix =
        docType === 'invoice' && invoice.proformaId
          ? `proforma-${String(invoice.proformaId)}`
          : 'proforma';

      const baseRow = {
        ...transformInvoiceToDB(invoice),
        orchestration_status: 'pending',
      };

      let savedId: string;
      if (isUpdate) {
        const { id: _drop, ...updates } = baseRow as Record<string, unknown> & { id?: unknown };
        const { data, error } = await withTimeout(
          admin.from('invoices').update(updates).eq('id', rawId).select('id').single(),
          DB_TIMEOUT_MS, 'update invoice pending'
        );
        if (error) throw error;
        savedId = String((data as { id: string }).id);
      } else {
        const insertRow = { ...baseRow };
        delete (insertRow as { id?: unknown }).id;
        if (!isUpdate) {
          const needsPdf = docType === 'proforma' || (docType === 'invoice' && !!invoice.proformaId);
          let fileUrl = invoice.fileUrl != null ? String(invoice.fileUrl) : undefined;
          if (!needsPdf || fileUrl || file) {
            // ok
          } else {
            return json({ error: 'PDF file is required for new proforma/invoice' }, 400);
          }
        }
        const { data, error } = await withTimeout(
          admin.from('invoices').insert([insertRow]).select('id').single(),
          DB_TIMEOUT_MS, 'insert invoice pending'
        );
        if (error) throw error;
        savedId = String((data as { id: string }).id);
      }
      pendingInvoiceId = savedId;

      let fileUrl = invoice.fileUrl != null ? String(invoice.fileUrl) : undefined;
      if (file) {
        const bytes = await file.arrayBuffer();
        const up = await uploadPdf(admin, bytes, prefix);
        uploadedPath = up.path;
        fileUrl = up.publicUrl;

        const { error: upErr } = await withTimeout(
          admin.from('invoices').update({
            file_url: fileUrl,
            orchestration_status: 'uploaded',
          }).eq('id', savedId),
          DB_TIMEOUT_MS, 'mark invoice uploaded'
        );
        if (upErr) {
          await removeStoragePaths(admin, [uploadedPath]);
          uploadedPath = null;
          throw upErr;
        }
      }

      const finalUpdate: Record<string, unknown> = {
        orchestration_status: 'finalized',
      };
      if (fileUrl) finalUpdate.file_url = fileUrl;
      const { data: finalRow, error: finErr } = await withTimeout(
        admin.from('invoices').update(finalUpdate).eq('id', savedId).select('*').single(),
        DB_TIMEOUT_MS, 'finalize invoice'
      );
      if (finErr) {
        if (uploadedPath) {
          await removeStoragePaths(admin, [uploadedPath]).catch(() => {});
        }
        await withTimeout(
          admin.from('invoices').update({ orchestration_status: 'failed' }).eq('id', savedId),
          DB_TIMEOUT_MS, 'mark invoice failed'
        ).catch(() => {});
        throw finErr;
      }
      pendingInvoiceId = null;

      if (offerItemId && docType === 'proforma') {
        await updateOfferItemOnProformaSave(admin, offerItemId, savedId).catch((e) =>
          console.error('[save-invoice] offer_item update failed (non-fatal)', e)
        );
      }

      const payload = {
        savedInvoice: transformInvoiceFromDB(finalRow as Record<string, unknown>),
        mode,
      };
      await completeIdempotency(admin, idem.rowId, payload);
      return json(payload, 200);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (uploadedPath) {
        try { await removeStoragePaths(admin, [uploadedPath]); } catch (re) {
          console.error('[save-invoice] cleanup storage failed', re);
        }
      }
      if (pendingInvoiceId) {
        await admin.from('invoices').update({ orchestration_status: 'failed' }).eq('id', pendingInvoiceId).then(null, () => {});
      }
      await failIdempotency(admin, idem.rowId, msg);
      return json({ error: msg }, 500);
    }
  } catch (e) {
    if (e instanceof CommandAuthError) {
      return json({ error: e.message }, e.status);
    }
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[save-invoice]', e);
    return json({ error: msg }, 500);
  }
}
