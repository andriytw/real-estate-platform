-- Phase 2+3: OCR fields, extended processing_status, per-row storage bucket, audit log, legacy migration key.

-- --- OCR + bucket ---
ALTER TABLE public.accounting_property_documents
  ADD COLUMN IF NOT EXISTS ocr_status TEXT NOT NULL DEFAULT 'idle'
    CHECK (ocr_status IN ('idle', 'pending', 'processing', 'ok', 'failed'));
ALTER TABLE public.accounting_property_documents
  ADD COLUMN IF NOT EXISTS ocr_error TEXT NULL;
ALTER TABLE public.accounting_property_documents
  ADD COLUMN IF NOT EXISTS ocr_raw JSONB NULL;
ALTER TABLE public.accounting_property_documents
  ADD COLUMN IF NOT EXISTS storage_bucket TEXT NOT NULL DEFAULT 'accounting-property-docs';

ALTER TABLE public.accounting_property_documents
  ADD COLUMN IF NOT EXISTS migrated_from_expense_document_id UUID NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_property_docs_migrated_expense
  ON public.accounting_property_documents(migrated_from_expense_document_id)
  WHERE migrated_from_expense_document_id IS NOT NULL;

-- Extend processing status (drop old check if present)
ALTER TABLE public.accounting_property_documents DROP CONSTRAINT IF EXISTS accounting_property_documents_processing_status_check;
ALTER TABLE public.accounting_property_documents
  ADD CONSTRAINT accounting_property_documents_processing_status_check
  CHECK (processing_status IN ('draft', 'ready', 'reviewed', 'archived'));

-- --- Audit trail ---
CREATE TABLE IF NOT EXISTS public.accounting_property_document_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.accounting_property_documents(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  detail JSONB NULL,
  created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acct_doc_audit_document
  ON public.accounting_property_document_audit(document_id, created_at DESC);

ALTER TABLE public.accounting_property_document_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "accounting_property_document_audit_select" ON public.accounting_property_document_audit;
CREATE POLICY "accounting_property_document_audit_select"
  ON public.accounting_property_document_audit FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "accounting_property_document_audit_insert" ON public.accounting_property_document_audit;
CREATE POLICY "accounting_property_document_audit_insert"
  ON public.accounting_property_document_audit FOR INSERT TO authenticated WITH CHECK (true);

-- Data migration from property_expense_* → see 20260424130001_migrate_property_expense_to_canonical.sql
