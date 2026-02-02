-- ============================================================================
-- Migration: Add payment_proof_url to invoices (payment proof document URL)
-- Separate from file_url (invoice/proforma document). For bank statement / confirmation PDFs.
-- Run in Supabase SQL Editor. Idempotent: safe to run multiple times.
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'payment_proof_url'
    ) THEN
        ALTER TABLE public.invoices ADD COLUMN payment_proof_url TEXT;
    END IF;
END $$;
