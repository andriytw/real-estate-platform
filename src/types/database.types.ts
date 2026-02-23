/**
 * Generated/updated types for Supabase tables.
 * Includes property_expense_documents and property_expense_items.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      property_expense_documents: {
        Row: {
          id: string;
          property_id: string;
          storage_path: string | null;
          file_name: string | null;
          file_hash: string | null;
          invoice_number: string | null;
          invoice_date: string | null;
          vendor: string | null;
          ocr_raw: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          storage_path?: string | null;
          file_name?: string | null;
          file_hash?: string | null;
          invoice_number?: string | null;
          invoice_date?: string | null;
          vendor?: string | null;
          ocr_raw?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          property_id?: string;
          storage_path?: string | null;
          file_name?: string | null;
          file_hash?: string | null;
          invoice_number?: string | null;
          invoice_date?: string | null;
          vendor?: string | null;
          ocr_raw?: Json | null;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'property_expense_documents_property_id_fkey'; columns: ['property_id']; referencedRelation: 'properties'; referencedColumns: ['id'] }
        ];
      };
      property_expense_items: {
        Row: {
          id: string;
          property_id: string;
          document_id: string | null;
          category_code: string | null;
          description: string;
          quantity: number;
          unit_price: number | null;
          invoice_number: string | null;
          invoice_date: string | null;
          vendor: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          document_id?: string | null;
          category_code?: string | null;
          description: string;
          quantity?: number;
          unit_price?: number | null;
          invoice_number?: string | null;
          invoice_date?: string | null;
          vendor?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          property_id?: string;
          document_id?: string | null;
          category_code?: string | null;
          description?: string;
          quantity?: number;
          unit_price?: number | null;
          invoice_number?: string | null;
          invoice_date?: string | null;
          vendor?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'property_expense_items_property_id_fkey'; columns: ['property_id']; referencedRelation: 'properties'; referencedColumns: ['id'] },
          { foreignKeyName: 'property_expense_items_document_id_fkey'; columns: ['document_id']; referencedRelation: 'property_expense_documents'; referencedColumns: ['id'] }
        ];
      };
    };
  };
}
