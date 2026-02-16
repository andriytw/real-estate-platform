/**
 * Property inventory from documents (OCR). Separate from warehouse — no warehouse_stock, stock_movements, etc.
 * Persists to property_inventory_documents and property_inventory_items.
 * Files stored in Storage bucket property-inventory-docs.
 */

import { supabase } from '../utils/supabase/client';

const PROPERTY_INVENTORY_DOCS_BUCKET = 'property-inventory-docs';

export interface PropertyInventoryDocumentRow {
  id: string;
  property_id: string;
  storage_path: string | null;
  file_url: string | null;
  file_name: string | null;
  file_hash: string | null;
  invoice_number: string | null;
  purchase_date: string | null;
  store: string | null;
  ocr_raw: Record<string, unknown> | null;
  created_at: string;
}

/** Document fields joined to each item when listing with listItems() */
export interface PropertyInventoryDocumentInfo {
  storage_path: string | null;
  file_name: string | null;
  invoice_number: string | null;
}

export interface PropertyInventoryItemWithDocument extends PropertyInventoryItemRow {
  property_inventory_documents: PropertyInventoryDocumentInfo | null;
}

export interface PropertyInventoryDocumentInsert {
  id?: string;
  storage_path?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  file_hash?: string | null;
  invoice_number?: string | null;
  purchase_date?: string | null;
  store?: string | null;
  ocr_raw?: Record<string, unknown> | null;
}

export interface PropertyInventoryItemRow {
  id: string;
  property_id: string;
  document_id: string | null;
  article: string | null;
  name: string;
  quantity: number;
  unit_price: number | null;
  invoice_number: string | null;
  purchase_date: string | null;
  store: string | null;
  created_at: string;
  updated_at: string;
}


export interface PropertyInventoryItemInsert {
  property_id: string;
  document_id?: string | null;
  article?: string | null;
  name: string;
  quantity: number;
  unit_price?: number | null;
  invoice_number?: string | null;
  purchase_date?: string | null;
  store?: string | null;
}

export const propertyInventoryService = {
  async listItems(propertyId: string): Promise<PropertyInventoryItemRow[]> {
    const { data, error } = await supabase
      .from('property_inventory_items')
      .select('*')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as PropertyInventoryItemRow[];
  },

  /** List items with joined document (storage_path, file_name, invoice_number) for per-row document links */
  async listItemsWithDocuments(propertyId: string): Promise<PropertyInventoryItemWithDocument[]> {
    const { data, error } = await supabase
      .from('property_inventory_items')
      .select('*, property_inventory_documents(storage_path, file_name, invoice_number)')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as PropertyInventoryItemWithDocument[];
  },

  async createDocument(
    propertyId: string,
    metadata: PropertyInventoryDocumentInsert
  ): Promise<string> {
    const row: Record<string, unknown> = {
      property_id: propertyId,
      storage_path: metadata.storage_path ?? null,
      file_url: metadata.file_url ?? null,
      file_name: metadata.file_name ?? null,
      file_hash: metadata.file_hash ?? null,
      invoice_number: metadata.invoice_number ?? null,
      purchase_date: metadata.purchase_date ?? null,
      store: metadata.store ?? null,
      ocr_raw: metadata.ocr_raw ?? null,
    };
    if (metadata.id) row.id = metadata.id;
    const { data, error } = await supabase
      .from('property_inventory_documents')
      .insert([row])
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  },

  /** Upload file to bucket property-inventory-docs; returns storage path for the document row */
  async uploadDocumentFile(
    propertyId: string,
    documentId: string,
    file: File
  ): Promise<string> {
    const safeName = file.name.replace(/[/\\]/g, '_');
    const storagePath = `property/${propertyId}/${documentId}/${safeName}`;
    const { error } = await supabase.storage
      .from(PROPERTY_INVENTORY_DOCS_BUCKET)
      .upload(storagePath, file, { cacheControl: '3600', upsert: false });
    if (error) throw new Error(error.message || 'Storage upload failed');
    return storagePath;
  },

  /** Best-effort: remove object from bucket (e.g. cleanup orphan after failed insert) */
  async removeDocumentFile(storagePath: string): Promise<void> {
    await supabase.storage.from(PROPERTY_INVENTORY_DOCS_BUCKET).remove([storagePath]);
  },

  /**
   * Upload file then insert document row (atomic-ish). Returns documentId and storage_path.
   * If insert fails after upload, optionally removes the uploaded object (cleanup).
   */
  async createDocumentAndUpload(
    propertyId: string,
    file: File,
    metadata: {
      file_name?: string | null;
      invoice_number?: string | null;
      purchase_date?: string | null;
      store?: string | null;
      ocr_raw?: Record<string, unknown> | null;
    }
  ): Promise<{ documentId: string; storage_path: string }> {
    const documentId = crypto.randomUUID();
    const safeName = file.name.replace(/[/\\]/g, '_');
    const storagePath = `property/${propertyId}/${documentId}/${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(PROPERTY_INVENTORY_DOCS_BUCKET)
      .upload(storagePath, file, { cacheControl: '3600', upsert: false });
    if (uploadError) throw new Error(uploadError.message || 'Storage upload failed');

    try {
      const { error: insertError } = await supabase.from('property_inventory_documents').insert({
        id: documentId,
        property_id: propertyId,
        storage_path: storagePath,
        file_name: metadata.file_name ?? null,
        invoice_number: metadata.invoice_number ?? null,
        purchase_date: metadata.purchase_date ?? null,
        store: metadata.store ?? null,
        ocr_raw: metadata.ocr_raw ?? null,
      });
      if (insertError) throw insertError;
      return { documentId, storage_path: storagePath };
    } catch (e) {
      try {
        await supabase.storage.from(PROPERTY_INVENTORY_DOCS_BUCKET).remove([storagePath]);
      } catch {
        // best-effort cleanup; ignore
      }
      throw e;
    }
  },

  /** Create signed URL for viewing/downloading a document (expiry in seconds) */
  async getDocumentSignedUrl(storagePath: string, expirySeconds: number = 3600): Promise<string> {
    const { data, error } = await supabase.storage
      .from(PROPERTY_INVENTORY_DOCS_BUCKET)
      .createSignedUrl(storagePath, expirySeconds);
    if (error) throw new Error(error.message || 'Failed to create signed URL');
    if (!data?.signedUrl) throw new Error('No signed URL returned');
    return data.signedUrl;
  },

  async appendItems(
    propertyId: string,
    documentId: string | null,
    items: PropertyInventoryItemInsert[]
  ): Promise<void> {
    if (items.length === 0) return;
    const rows = items.map((item) => ({
      property_id: propertyId,
      document_id: documentId ?? null,
      article: item.article ?? null,
      name: item.name,
      quantity: item.quantity,
      unit_price: item.unit_price ?? null,
      invoice_number: item.invoice_number ?? null,
      purchase_date: item.purchase_date ?? null,
      store: item.store ?? null,
    }));
    const { error } = await supabase.from('property_inventory_items').insert(rows);
    if (error) throw error;
  },

  async createItem(
    propertyId: string,
    item: Omit<PropertyInventoryItemInsert, 'property_id'>
  ): Promise<PropertyInventoryItemRow> {
    const row = {
      property_id: propertyId,
      document_id: null,
      article: item.article ?? null,
      name: item.name,
      quantity: item.quantity,
      unit_price: item.unit_price ?? null,
      invoice_number: item.invoice_number ?? null,
      purchase_date: item.purchase_date ?? null,
      store: item.store ?? null,
    };
    const { data, error } = await supabase
      .from('property_inventory_items')
      .insert([row])
      .select()
      .single();
    if (error) throw error;
    return data as PropertyInventoryItemRow;
  },

  async updateItem(
    itemId: string,
    patch: Partial<Omit<PropertyInventoryItemRow, 'id' | 'property_id' | 'created_at' | 'updated_at'>>
  ): Promise<PropertyInventoryItemRow> {
    const updatePayload: Record<string, unknown> = {};
    if (patch.article !== undefined) updatePayload.article = patch.article;
    if (patch.document_id !== undefined) updatePayload.document_id = patch.document_id;
    if (patch.name !== undefined) updatePayload.name = patch.name;
    if (patch.quantity !== undefined) updatePayload.quantity = patch.quantity;
    if (patch.unit_price !== undefined) updatePayload.unit_price = patch.unit_price;
    if (patch.invoice_number !== undefined) updatePayload.invoice_number = patch.invoice_number;
    if (patch.purchase_date !== undefined) updatePayload.purchase_date = patch.purchase_date;
    if (patch.store !== undefined) updatePayload.store = patch.store;
    if (Object.keys(updatePayload).length === 0) {
      const { data } = await supabase.from('property_inventory_items').select('*').eq('id', itemId).single();
      return data as PropertyInventoryItemRow;
    }
    const { data, error } = await supabase
      .from('property_inventory_items')
      .update(updatePayload)
      .eq('id', itemId)
      .select()
      .single();
    if (error) throw error;
    return data as PropertyInventoryItemRow;
  },

  async deleteItem(itemId: string): Promise<void> {
    const { error } = await supabase.from('property_inventory_items').delete().eq('id', itemId);
    if (error) throw error;
  },
};
