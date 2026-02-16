/**
 * Property expense invoices: documents + items. Category is per item (category_id), not per document.
 * Bucket: property-expense-docs. Path: property/{propertyId}/{documentId}/{safeFileName}.
 */

import { supabase } from '../utils/supabase/client';

const PROPERTY_EXPENSE_DOCS_BUCKET = 'property-expense-docs';

export interface PropertyExpenseDocumentRow {
  id: string;
  property_id: string;
  storage_path: string;
  file_name: string | null;
  file_hash: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  vendor: string | null;
  ocr_raw: Record<string, unknown> | null;
  created_at: string;
}

export interface PropertyExpenseDocumentInfo {
  storage_path: string;
  file_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  vendor: string | null;
}

export interface PropertyExpenseCategoryInfo {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
}

export interface PropertyExpenseItemRow {
  id: string;
  property_id: string;
  document_id: string | null;
  category_id: string;
  article: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  line_total: number | null;
  invoice_number: string | null;
  invoice_date: string | null;
  vendor: string | null;
  created_at: string;
  updated_at: string;
}

export interface PropertyExpenseItemWithDocument extends PropertyExpenseItemRow {
  property_expense_documents: PropertyExpenseDocumentInfo | null;
  property_expense_categories: PropertyExpenseCategoryInfo | null;
}

export interface PropertyExpenseItemInsert {
  property_id: string;
  document_id?: string | null;
  category_id: string;
  article?: string | null;
  name: string;
  quantity: number;
  unit_price?: number;
  line_total?: number | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  vendor?: string | null;
}

export const propertyExpenseService = {
  async listItemsWithDocuments(propertyId: string): Promise<PropertyExpenseItemWithDocument[]> {
    const { data, error } = await supabase
      .from('property_expense_items')
      .select(
        '*, property_expense_documents(storage_path, file_name, invoice_number, invoice_date, vendor), property_expense_categories(id, name, code, is_active)'
      )
      .eq('property_id', propertyId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as PropertyExpenseItemWithDocument[];
  },

  async getDocumentSignedUrl(storagePath: string, expirySeconds = 3600): Promise<string> {
    const { data, error } = await supabase.storage
      .from(PROPERTY_EXPENSE_DOCS_BUCKET)
      .createSignedUrl(storagePath, expirySeconds);
    if (error) throw new Error(error.message || 'Failed to create signed URL');
    if (!data?.signedUrl) throw new Error('No signed URL returned');
    return data.signedUrl;
  },

  async createDocumentAndUpload(
    propertyId: string,
    file: File,
    metadata: {
      file_name?: string | null;
      invoice_number?: string | null;
      invoice_date?: string | null;
      vendor?: string | null;
      ocr_raw?: Record<string, unknown> | null;
    }
  ): Promise<{ documentId: string; storage_path: string }> {
    const documentId = crypto.randomUUID();
    const safeName = file.name.replace(/[/\\]/g, '_');
    const storagePath = `property/${propertyId}/${documentId}/${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(PROPERTY_EXPENSE_DOCS_BUCKET)
      .upload(storagePath, file, { cacheControl: '3600', upsert: false });
    if (uploadError) throw new Error(uploadError.message || 'Storage upload failed');

    try {
      const { error: insertError } = await supabase.from('property_expense_documents').insert({
        id: documentId,
        property_id: propertyId,
        storage_path: storagePath,
        file_name: metadata.file_name ?? null,
        invoice_number: metadata.invoice_number ?? null,
        invoice_date: metadata.invoice_date ?? null,
        vendor: metadata.vendor ?? null,
        ocr_raw: metadata.ocr_raw ?? null,
      });
      if (insertError) throw insertError;
      return { documentId, storage_path: storagePath };
    } catch (e) {
      try {
        await supabase.storage.from(PROPERTY_EXPENSE_DOCS_BUCKET).remove([storagePath]);
      } catch {
        // best-effort cleanup
      }
      throw e;
    }
  },

  async appendItems(
    propertyId: string,
    documentId: string,
    items: Array<{
      category_id: string;
      article?: string | null;
      name: string;
      quantity: number;
      unit_price: number;
      invoice_number?: string | null;
      invoice_date?: string | null;
      vendor?: string | null;
    }>
  ): Promise<void> {
    if (items.length === 0) return;
    const rows = items.map((item) => ({
      property_id: propertyId,
      document_id: documentId,
      category_id: item.category_id,
      article: item.article ?? null,
      name: item.name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      line_total: item.quantity * item.unit_price,
      invoice_number: item.invoice_number ?? null,
      invoice_date: item.invoice_date ?? null,
      vendor: item.vendor ?? null,
    }));
    const { error } = await supabase.from('property_expense_items').insert(rows);
    if (error) throw error;
  },

  async createItem(
    propertyId: string,
    item: Omit<PropertyExpenseItemInsert, 'property_id'>
  ): Promise<PropertyExpenseItemRow> {
    const row = {
      property_id: propertyId,
      document_id: null,
      category_id: item.category_id,
      article: item.article ?? null,
      name: item.name,
      quantity: item.quantity,
      unit_price: item.unit_price ?? 0,
      line_total: (item.quantity ?? 1) * (item.unit_price ?? 0),
      invoice_number: item.invoice_number ?? null,
      invoice_date: item.invoice_date ?? null,
      vendor: item.vendor ?? null,
    };
    const { data, error } = await supabase
      .from('property_expense_items')
      .insert([row])
      .select()
      .single();
    if (error) throw error;
    return data as PropertyExpenseItemRow;
  },

  async updateItem(
    itemId: string,
    patch: Partial<{
      category_id: string;
      article: string | null;
      name: string;
      quantity: number;
      unit_price: number;
      invoice_number: string | null;
      invoice_date: string | null;
      vendor: string | null;
    }>
  ): Promise<PropertyExpenseItemRow> {
    const updatePayload: Record<string, unknown> = { ...patch };
    if (Object.keys(updatePayload).length === 0) {
      const { data } = await supabase.from('property_expense_items').select('*').eq('id', itemId).single();
      return data as PropertyExpenseItemRow;
    }
    const { data, error } = await supabase
      .from('property_expense_items')
      .update(updatePayload)
      .eq('id', itemId)
      .select()
      .single();
    if (error) throw error;
    return data as PropertyExpenseItemRow;
  },

  async deleteItem(itemId: string): Promise<void> {
    const { error } = await supabase.from('property_expense_items').delete().eq('id', itemId);
    if (error) throw error;
  },

  /** Delete entire invoice: all items for the document, then document row and storage file. */
  async deleteDocumentAndItems(documentId: string, storagePath: string): Promise<void> {
    const { error: itemsError } = await supabase
      .from('property_expense_items')
      .delete()
      .eq('document_id', documentId);
    if (itemsError) throw itemsError;
    const { error: docError } = await supabase
      .from('property_expense_documents')
      .delete()
      .eq('id', documentId);
    if (docError) throw docError;
    try {
      await supabase.storage.from(PROPERTY_EXPENSE_DOCS_BUCKET).remove([storagePath]);
    } catch {
      // best-effort; document row is already deleted
    }
  },
};
