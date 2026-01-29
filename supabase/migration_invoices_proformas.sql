-- ============================================================================
-- Migration: Proformas and invoices (file_url, document_type, proforma_id)
-- Run this in Supabase SQL Editor. Idempotent: safe to run multiple times.
-- ============================================================================

-- STEP 1: Add file_url to invoices
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'file_url'
    ) THEN
        ALTER TABLE public.invoices ADD COLUMN file_url TEXT;
    END IF;
END $$;

-- STEP 2: Add document_type to invoices (proforma | invoice)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'document_type'
    ) THEN
        ALTER TABLE public.invoices ADD COLUMN document_type TEXT DEFAULT 'proforma';
        ALTER TABLE public.invoices ADD CONSTRAINT chk_invoices_document_type
            CHECK (document_type IN ('proforma', 'invoice'));
    END IF;
END $$;

-- STEP 3: Add proforma_id (self-reference: invoice belongs to proforma)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'proforma_id'
    ) THEN
        ALTER TABLE public.invoices ADD COLUMN proforma_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS idx_invoices_proforma_id ON public.invoices(proforma_id);
    END IF;
END $$;

-- STEP 4: Backfill existing rows as proformas
UPDATE public.invoices
SET document_type = 'proforma', proforma_id = NULL
WHERE document_type IS NULL OR (proforma_id IS NULL AND document_type = 'proforma');

-- Ensure all existing rows have document_type
UPDATE public.invoices SET document_type = 'proforma' WHERE document_type IS NULL;

-- STEP 5: Storage bucket for proforma/invoice PDFs (optional; requires storage schema)
-- Run in SQL Editor if you want bucket created by migration. Otherwise create via Dashboard > Storage.
-- INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- VALUES ('invoice-pdfs', 'invoice-pdfs', false, 10485760, ARRAY['application/pdf'])
-- ON CONFLICT (id) DO NOTHING;
-- RLS: add policies in Dashboard > Storage > invoice-pdfs for authenticated upload/read (e.g. allow authenticated to insert/select).
