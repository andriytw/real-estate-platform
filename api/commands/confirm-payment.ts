import { getSupabaseAdmin } from '../_lib/supabase-admin.js';
import { withTimeout } from '../_lib/with-timeout.js';
import {
  requireCommandProfile,
  assertCanConfirmPayment,
  assertInvoiceExistsForConfirm,
  CommandAuthError,
} from '../_lib/command-auth.js';
import { resolveIdempotency, completeIdempotency, failIdempotency } from '../_lib/idempotency.js';

const PAYMENT_PROOFS_BUCKET = 'payment-proofs';
const UPLOAD_TIMEOUT_MS = 90_000;
const DB_TIMEOUT_MS = 25_000;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function nextPayDocumentNumber(admin: ReturnType<typeof getSupabaseAdmin>): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `PAY-${year}-`;
  const { data, error } = await withTimeout(
    admin
      .from('payment_proofs')
      .select('document_number')
      .not('document_number', 'is', null)
      .like('document_number', `${prefix}%`),
    DB_TIMEOUT_MS, 'next pay document number'
  );
  if (error) throw error;
  let maxN = 0;
  for (const row of data || []) {
    const num = String(row.document_number || '').replace(prefix, '');
    const n = parseInt(num, 10);
    if (!Number.isNaN(n) && n > maxN) maxN = n;
  }
  return `${prefix}${String(maxN + 1).padStart(6, '0')}`;
}

async function setCurrentProofAdmin(
  admin: ReturnType<typeof getSupabaseAdmin>,
  invoiceId: string,
  proofId: string
): Promise<void> {
  const { data: existing } = await withTimeout(
    admin.from('payment_proofs').select('id').eq('invoice_id', invoiceId).eq('is_current', true),
    DB_TIMEOUT_MS, 'select current proofs'
  );
  const now = new Date().toISOString();
  for (const row of existing || []) {
    if (row.id !== proofId) {
      await withTimeout(
        admin.from('payment_proofs').update({ is_current: false, updated_at: now }).eq('id', row.id),
        DB_TIMEOUT_MS, 'unset current proof'
      );
    }
  }
  await withTimeout(
    admin.from('payment_proofs').update({ is_current: true, updated_at: now }).eq('id', proofId),
    DB_TIMEOUT_MS, 'set current proof'
  );
}

export async function POST(request: Request) {
  let uploadedStoragePath: string | null = null;
  try {
    const profile = await requireCommandProfile(request);
    assertCanConfirmPayment(profile);

    const idemKey = request.headers.get('x-idempotency-key')?.trim();
    if (!idemKey) {
      return json({ error: 'Missing X-Idempotency-Key header' }, 400);
    }

    const ct = request.headers.get('content-type') || '';
    if (!ct.includes('multipart/form-data')) {
      return json({ error: 'Expected multipart/form-data' }, 400);
    }

    const form = await request.formData();
    const proformaId = String(form.get('proformaId') || '').trim();
    const documentNumberRaw = String(form.get('documentNumber') || '').trim();
    const existingProofIdRaw = String(form.get('existingProofId') || '').trim();
    const fileEntry = form.get('file');
    const pdfFile = fileEntry instanceof File && fileEntry.size > 0 ? fileEntry : null;

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!proformaId) {
      return json({ error: 'Missing proformaId' }, 400);
    }

    const admin = getSupabaseAdmin();
    await assertInvoiceExistsForConfirm(admin, proformaId);

    const idem = await resolveIdempotency(admin, profile.id, 'confirm-payment', idemKey);
    if (idem.kind === 'replay') {
      return json(idem.result, 200);
    }
    if (idem.kind === 'conflict') {
      return json({ error: idem.message }, 409);
    }

    try {
      let proofId: string;
      let proofHasFile = false;

      if (UUID_RE.test(existingProofIdRaw)) {
        const { data: retryRow, error: retryErr } = await withTimeout(
          admin
            .from('payment_proofs')
            .select('id, file_path, rpc_confirmed_at, invoice_id')
            .eq('id', existingProofIdRaw)
            .maybeSingle(),
          DB_TIMEOUT_MS,
          'load existing proof for retry'
        );
        if (retryErr || !retryRow?.id) {
          throw retryErr || new Error('Payment proof not found');
        }
        if (String(retryRow.invoice_id) !== proformaId) {
          throw new Error('Payment proof does not belong to this invoice');
        }
        proofId = retryRow.id as string;
        proofHasFile = !!retryRow.file_path;
      } else {
        const { data: existingProof } = await withTimeout(
          admin.from('payment_proofs').select('id, file_path, rpc_confirmed_at').eq('invoice_id', proformaId).eq('idempotency_key', idemKey).maybeSingle(),
          DB_TIMEOUT_MS, 'check existing proof'
        );

        if (existingProof?.id) {
          proofId = existingProof.id as string;
          proofHasFile = !!existingProof.file_path;
        } else {
          let docNum = documentNumberRaw || (await nextPayDocumentNumber(admin));
          const insertRow = {
            invoice_id: proformaId,
            created_by: profile.id,
            document_number: docNum,
            is_current: false,
            state: 'active',
            idempotency_key: idemKey,
          };
          const { data: ins, error: insErr } = await withTimeout(
            admin.from('payment_proofs').insert([insertRow]).select('id').single(),
            DB_TIMEOUT_MS, 'insert proof row'
          );
          if (insErr?.code === '23505') {
            const { data: again } = await withTimeout(
              admin.from('payment_proofs').select('id, file_path').eq('invoice_id', proformaId).eq('idempotency_key', idemKey).maybeSingle(),
              DB_TIMEOUT_MS, 'recheck proof after conflict'
            );
            if (!again?.id) throw insErr;
            proofId = again.id as string;
            proofHasFile = !!again.file_path;
          } else if (insErr || !ins?.id) {
            throw insErr || new Error('Failed to create payment proof');
          } else {
            proofId = ins.id as string;
          }
        }
      }

      if (pdfFile && !proofHasFile) {
        const safeName = `${Date.now()}-${crypto.randomUUID()}.pdf`;
        const path = `payments/${proformaId}/${proofId}/${safeName}`;
        const buf = await pdfFile.arrayBuffer();
        const { error: upErr } = await withTimeout(
          admin.storage.from(PAYMENT_PROOFS_BUCKET).upload(path, buf, {
            contentType: 'application/pdf',
            upsert: false,
            cacheControl: '3600',
          }),
          UPLOAD_TIMEOUT_MS,
          'upload payment proof'
        );
        if (upErr) {
          throw new Error(upErr.message || 'Payment proof upload failed');
        }
        uploadedStoragePath = path;
        const { error: upRowErr } = await withTimeout(
          admin
            .from('payment_proofs')
            .update({
              file_path: path,
              file_name: pdfFile.name || 'document.pdf',
              file_uploaded_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', proofId),
          DB_TIMEOUT_MS,
          'update proof file metadata'
        );
        if (upRowErr) {
          await withTimeout(
            admin.storage.from(PAYMENT_PROOFS_BUCKET).remove([path]),
            UPLOAD_TIMEOUT_MS,
            'remove proof file after metadata failure'
          ).catch(() => {});
          uploadedStoragePath = null;
          throw upRowErr;
        }
        proofHasFile = true;
      }

      const { data: proofState } = await withTimeout(
        admin.from('payment_proofs').select('rpc_confirmed_at').eq('id', proofId).single(),
        DB_TIMEOUT_MS, 'check proof rpc state'
      );

      let bookingId: string;

      if (proofState?.rpc_confirmed_at) {
        const { data: bookingRow } = await withTimeout(
          admin.from('bookings').select('id').eq('source_invoice_id', proformaId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
          DB_TIMEOUT_MS, 'find booking for confirmed proof'
        );
        if (!bookingRow?.id) {
          throw new Error('Payment proof already confirmed but booking not found');
        }
        bookingId = bookingRow.id as string;
      } else {
        const { data: rpcData, error: rpcErr } = await withTimeout(
          admin.rpc('mark_invoice_paid_and_confirm_booking', { p_invoice_id: proformaId }),
          DB_TIMEOUT_MS,
          'mark_invoice_paid_and_confirm_booking'
        );
        if (rpcErr) {
          const msg = rpcErr.message || '';
          if (msg.includes('already paid')) {
            const { data: bookingRow } = await withTimeout(
              admin.from('bookings').select('id').eq('source_invoice_id', proformaId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
              DB_TIMEOUT_MS, 'find booking after already-paid'
            );
            if (!bookingRow?.id) throw rpcErr;
            bookingId = bookingRow.id as string;
          } else {
            throw rpcErr;
          }
        } else if (!rpcData) {
          throw new Error('RPC returned no booking ID');
        } else {
          bookingId = String(rpcData);
        }

        await withTimeout(
          admin.from('payment_proofs').update({ rpc_confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', proofId),
          DB_TIMEOUT_MS, 'stamp rpc_confirmed_at'
        );
      }

      if (proofHasFile) {
        await setCurrentProofAdmin(admin, proformaId, proofId);
      }

      const result = { bookingId, proofId };
      await completeIdempotency(admin, idem.rowId, result);
      return json(result, 200);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (uploadedStoragePath) {
        try {
          await withTimeout(
            admin.storage.from(PAYMENT_PROOFS_BUCKET).remove([uploadedStoragePath]),
            UPLOAD_TIMEOUT_MS,
            'confirm-payment storage cleanup'
          );
        } catch (re) {
          console.error('[confirm-payment] storage cleanup failed', re);
        }
      }
      await failIdempotency(admin, idem.rowId, msg);
      return json({ error: msg }, 500);
    }
  } catch (e) {
    if (e instanceof CommandAuthError) {
      return json({ error: e.message }, e.status);
    }
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[confirm-payment]', e);
    return json({ error: msg }, 500);
  }
}
