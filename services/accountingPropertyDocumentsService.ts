/**
 * Canonical accounting property documents (Accounting → Invoices intake).
 * Separate from public.invoices (sales) and from legacy property_expense_*.
 */

import { supabase } from '../utils/supabase/client';
import { safeGetUser } from '../lib/supabaseAuthGuard';
import { recognizeInvoiceWithOcr, type OcrInvoiceData } from './ocrInvoiceClient';
import type { AccountingDocumentDirection } from './accountingDocumentCategoryService';

const BUCKET = 'accounting-property-docs';

export type OcrStatus = 'idle' | 'pending' | 'processing' | 'ok' | 'failed';

export type ProcessingStatus = 'draft' | 'ready' | 'reviewed' | 'archived';

export type AccountingPropertyDocumentRow = {
  id: string;
  property_id: string | null;
  direction: AccountingDocumentDirection;
  category_id: string | null;
  document_type: 'invoice' | 'receipt' | 'other';
  storage_path: string;
  /** Defaults to `accounting-property-docs` when absent (pre-migration rows). */
  storage_bucket?: string;
  file_name: string | null;
  mime: string | null;
  counterparty_name: string | null;
  invoice_no: string | null;
  invoice_date: string | null;
  due_date: string | null;
  amount_total: number | null;
  currency: string;
  processing_status: ProcessingStatus;
  ocr_status: OcrStatus;
  ocr_error: string | null;
  ocr_raw: OcrInvoiceData | Record<string, unknown> | null;
  notes: string | null;
  migrated_from_expense_document_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AccountingPropertyDocumentWithCategory = AccountingPropertyDocumentRow & {
  accounting_document_categories: { name: string; code: string } | null;
};

export type AccountingPropertyDocumentLineRow = {
  id: string;
  document_id: string;
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  vat: number | null;
  line_total: number | null;
  sort_order: number;
  created_at: string;
};

export type DocumentAuditEntry = {
  id: string;
  document_id: string;
  action: string;
  detail: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
};

export function resolveProcessingStatus(
  current: ProcessingStatus,
  merged: { property_id: string | null; category_id: string | null },
  explicitStatus: ProcessingStatus | undefined
): ProcessingStatus {
  if (explicitStatus === 'archived') return 'archived';
  if (explicitStatus === 'reviewed') return 'reviewed';
  if (explicitStatus === 'draft' || explicitStatus === 'ready') {
    if (!merged.property_id || !merged.category_id) return 'draft';
    return explicitStatus;
  }
  if (!merged.property_id || !merged.category_id) return 'draft';
  if (current === 'archived') return 'archived';
  if (current === 'reviewed') return 'reviewed';
  return 'ready';
}

async function appendAudit(
  documentId: string,
  action: string,
  detail?: Record<string, unknown> | null
): Promise<void> {
  const user = await safeGetUser();
  await supabase.from('accounting_property_document_audit').insert({
    document_id: documentId,
    action,
    detail: detail ?? null,
    created_by: user?.id ?? null,
  });
}

export const accountingPropertyDocumentsService = {
  BUCKET,

  async listAll(statusFilter: ProcessingStatus | 'all' = 'all'): Promise<AccountingPropertyDocumentWithCategory[]> {
    let q = supabase
      .from('accounting_property_documents')
      .select('*, accounting_document_categories(name, code)')
      .order('created_at', { ascending: false });
    if (statusFilter !== 'all') {
      q = q.eq('processing_status', statusFilter);
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message || 'Failed to list documents');
    return (data ?? []) as AccountingPropertyDocumentWithCategory[];
  },

  /** Ready (or reviewed) rows for property card — excludes draft/archived. */
  async listReadyForProperty(
    propertyId: string,
    direction: AccountingDocumentDirection
  ): Promise<AccountingPropertyDocumentWithCategory[]> {
    const { data, error } = await supabase
      .from('accounting_property_documents')
      .select('*, accounting_document_categories(name, code)')
      .eq('property_id', propertyId)
      .eq('direction', direction)
      .in('processing_status', ['ready', 'reviewed'])
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message || 'Failed to list property documents');
    return (data ?? []) as AccountingPropertyDocumentWithCategory[];
  },

  async getSignedUrl(
    storagePath: string,
    expirySeconds = 3600,
    storageBucket: string = BUCKET
  ): Promise<string> {
    const { data, error } = await supabase.storage
      .from(storageBucket)
      .createSignedUrl(storagePath, expirySeconds);
    if (error) throw new Error(error.message || 'Failed to create signed URL');
    if (!data?.signedUrl) throw new Error('No signed URL');
    return data.signedUrl;
  },

  urlForRow(row: Pick<AccountingPropertyDocumentRow, 'storage_path' | 'storage_bucket'>): Promise<string> {
    return this.getSignedUrl(row.storage_path, 3600, row.storage_bucket || BUCKET);
  },

  async listLines(documentId: string): Promise<AccountingPropertyDocumentLineRow[]> {
    const { data, error } = await supabase
      .from('accounting_property_document_lines')
      .select('*')
      .eq('document_id', documentId)
      .order('sort_order', { ascending: true });
    if (error) throw new Error(error.message || 'Failed to load line items');
    return (data ?? []) as AccountingPropertyDocumentLineRow[];
  },

  async listAudit(documentId: string, limit = 20): Promise<DocumentAuditEntry[]> {
    const { data, error } = await supabase
      .from('accounting_property_document_audit')
      .select('id, document_id, action, detail, created_by, created_at')
      .eq('document_id', documentId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message || 'Failed to load audit');
    return (data ?? []) as DocumentAuditEntry[];
  },

  async setProcessingStatus(
    id: string,
    processing_status: ProcessingStatus
  ): Promise<AccountingPropertyDocumentWithCategory> {
    const user = await safeGetUser();
    if (!user?.id) throw new Error('Not authenticated');
    const { data, error } = await supabase
      .from('accounting_property_documents')
      .update({ processing_status, updated_by: user.id })
      .eq('id', id)
      .select('*, accounting_document_categories(name, code)')
      .single();
    if (error) throw new Error(error.message || 'Status update failed');
    await appendAudit(id, 'status', { processing_status });
    return data as AccountingPropertyDocumentWithCategory;
  },

  async batchSetArchived(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const user = await safeGetUser();
    if (!user?.id) throw new Error('Not authenticated');
    const { error } = await supabase
      .from('accounting_property_documents')
      .update({ processing_status: 'archived', updated_by: user.id })
      .in('id', ids);
    if (error) throw new Error(error.message || 'Batch archive failed');
    await Promise.all(ids.map((id) => appendAudit(id, 'archived', { batch: true })));
  },

  async createDraftFromFile(file: File): Promise<AccountingPropertyDocumentWithCategory> {
    const user = await safeGetUser();
    if (!user?.id) throw new Error('Not authenticated');
    const documentId = crypto.randomUUID();
    const safeName = (file.name || 'document').replace(/[/\\]/g, '_');
    const path = `intake/${documentId}/${safeName}`;

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { cacheControl: '3600', upsert: false });
    if (upErr) throw new Error(upErr.message || 'Upload failed');

    const nextStatus = resolveProcessingStatus('draft', { property_id: null, category_id: null }, 'draft');
    const { data, error } = await supabase
      .from('accounting_property_documents')
      .insert({
        id: documentId,
        property_id: null,
        direction: 'expense',
        category_id: null,
        document_type: 'invoice',
        storage_path: path,
        storage_bucket: BUCKET,
        file_name: file.name,
        mime: file.type || null,
        counterparty_name: null,
        invoice_no: null,
        invoice_date: null,
        due_date: null,
        amount_total: null,
        currency: 'EUR',
        processing_status: nextStatus,
        notes: null,
        created_by: user.id,
        updated_by: user.id,
      })
      .select('*, accounting_document_categories(name, code)')
      .single();
    if (error) {
      await supabase.storage.from(BUCKET).remove([path]);
      throw new Error(error.message || 'Failed to create document');
    }
    await appendAudit(documentId, 'create_draft', { file_name: file.name });
    return data as AccountingPropertyDocumentWithCategory;
  },

  async replaceFile(id: string, file: File): Promise<AccountingPropertyDocumentWithCategory> {
    const user = await safeGetUser();
    if (!user?.id) throw new Error('Not authenticated');
    const { data: cur, error: e0 } = await supabase
      .from('accounting_property_documents')
      .select('storage_path, storage_bucket')
      .eq('id', id)
      .single();
    if (e0 || !cur) throw new Error('Document not found');
    const row = cur as { storage_path: string; storage_bucket: string | null };
    const prevPath = row.storage_path;
    const prevBucket = row.storage_bucket || BUCKET;
    const safeName = (file.name || 'document').replace(/[/\\]/g, '_');
    const newPath = `intake/${id}/${safeName}`;

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(newPath, file, { cacheControl: '3600', upsert: true });
    if (upErr) throw new Error(upErr.message || 'Upload failed');
    try {
      await supabase.storage.from(prevBucket).remove([prevPath]);
    } catch {
      // best-effort
    }
    const { data, error } = await supabase
      .from('accounting_property_documents')
      .update({
        storage_path: newPath,
        storage_bucket: BUCKET,
        file_name: file.name,
        mime: file.type || null,
        ocr_status: 'idle',
        ocr_error: null,
        ocr_raw: null,
        updated_by: user.id,
      })
      .eq('id', id)
      .select('*, accounting_document_categories(name, code)')
      .single();
    if (error) throw new Error(error.message || 'Update failed after upload');
    await supabase.from('accounting_property_document_lines').delete().eq('document_id', id);
    await appendAudit(id, 'replace_file', { file_name: file.name });
    return data as AccountingPropertyDocumentWithCategory;
  },

  async update(
    id: string,
    patch: Partial<{
      property_id: string | null;
      direction: AccountingDocumentDirection;
      category_id: string | null;
      document_type: 'invoice' | 'receipt' | 'other';
      counterparty_name: string | null;
      invoice_no: string | null;
      invoice_date: string | null;
      due_date: string | null;
      amount_total: number | null;
      currency: string;
      notes: string | null;
      processing_status: ProcessingStatus;
      ocr_status: OcrStatus;
      ocr_error: string | null;
      ocr_raw: OcrInvoiceData | Record<string, unknown> | null;
    }>
  ): Promise<AccountingPropertyDocumentWithCategory> {
    const user = await safeGetUser();
    if (!user?.id) throw new Error('Not authenticated');

    const { data: current, error: e0 } = await supabase
      .from('accounting_property_documents')
      .select('property_id, category_id, direction, document_type, processing_status')
      .eq('id', id)
      .single();
    if (e0 || !current) throw new Error('Document not found');
    const cur = current as {
      property_id: string | null;
      category_id: string | null;
      processing_status: ProcessingStatus;
    };
    const merged = {
      property_id: patch.property_id !== undefined ? patch.property_id : cur.property_id,
      category_id: patch.category_id !== undefined ? patch.category_id : cur.category_id,
    };
    const processing_status = resolveProcessingStatus(
      cur.processing_status,
      merged,
      patch.processing_status
    );

    const updatePayload: Record<string, unknown> = { processing_status, updated_by: user.id };
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'processing_status') continue;
      if (v !== undefined) (updatePayload as Record<string, unknown>)[k] = v;
    }

    const { data, error } = await supabase
      .from('accounting_property_documents')
      .update(updatePayload)
      .eq('id', id)
      .select('*, accounting_document_categories(name, code)')
      .single();
    if (error) throw new Error(error.message || 'Update failed');
    return data as AccountingPropertyDocumentWithCategory;
  },

  async runOcr(id: string): Promise<AccountingPropertyDocumentWithCategory> {
    const user = await safeGetUser();
    if (!user?.id) throw new Error('Not authenticated');
    const { data: row, error: e0 } = await supabase
      .from('accounting_property_documents')
      .select('*')
      .eq('id', id)
      .single();
    if (e0 || !row) throw new Error('Document not found');
    const doc = row as AccountingPropertyDocumentRow;
    const bucket = doc.storage_bucket || BUCKET;

    await supabase
      .from('accounting_property_documents')
      .update({ ocr_status: 'processing', ocr_error: null, updated_by: user.id })
      .eq('id', id);
    await appendAudit(id, 'ocr_start', {});

    const url = await this.getSignedUrl(doc.storage_path, 3600, bucket);
    const res = await fetch(url);
    if (!res.ok) {
      const msg = `Download failed: ${res.status}`;
      await supabase
        .from('accounting_property_documents')
        .update({ ocr_status: 'failed', ocr_error: msg, updated_by: user.id })
        .eq('id', id);
      await appendAudit(id, 'ocr_failed', { error: msg });
      throw new Error(msg);
    }
    const blob = await res.blob();
    const file = new File([blob], doc.file_name || 'document', { type: doc.mime || blob.type || 'application/octet-stream' });
    const ocr = await recognizeInvoiceWithOcr(file, doc.file_name);
    if (!ocr.ok) {
      await supabase
        .from('accounting_property_documents')
        .update({ ocr_status: 'failed', ocr_error: ocr.message, updated_by: user.id })
        .eq('id', id);
      await appendAudit(id, 'ocr_failed', { code: ocr.code, message: ocr.message });
      throw new Error(ocr.message);
    }
    const d = ocr.data;
    const items = d.items || [];
    let lineSum = 0;
    const lineRows = items.map((it, idx) => {
      const lineTotal = it.quantity * it.price;
      lineSum += lineTotal;
      return {
        document_id: id,
        description: it.name,
        quantity: it.quantity,
        unit_price: it.price,
        vat: null,
        line_total: lineTotal,
        sort_order: idx,
      };
    });
    await supabase.from('accounting_property_document_lines').delete().eq('document_id', id);
    if (lineRows.length) {
      const { error: le } = await supabase.from('accounting_property_document_lines').insert(lineRows);
      if (le) {
        await supabase
          .from('accounting_property_documents')
          .update({ ocr_status: 'failed', ocr_error: le.message, updated_by: user.id })
          .eq('id', id);
        throw new Error(le.message);
      }
    }
    const invDate = d.purchaseDate ? d.purchaseDate.toString().slice(0, 10) : null;
    const amount = lineSum > 0 ? lineSum : null;
    const updated = await this.update(id, {
      counterparty_name: d.vendor || null,
      invoice_no: d.invoiceNumber || null,
      invoice_date: invDate,
      amount_total: amount,
      ocr_status: 'ok',
      ocr_error: null,
      ocr_raw: d,
    });
    await appendAudit(id, 'ocr_ok', { itemCount: items.length });
    return updated;
  },

  async deleteDocument(
    id: string,
    storagePath: string,
    storageBucket: string = BUCKET
  ): Promise<void> {
    const { error } = await supabase.from('accounting_property_documents').delete().eq('id', id);
    if (error) throw new Error(error.message || 'Delete failed');
    try {
      await supabase.storage.from(storageBucket).remove([storagePath]);
    } catch {
      // best-effort
    }
  },
};
