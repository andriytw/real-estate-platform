-- ============================================================================
-- Migration: Storage bucket "payment-proofs" for payment confirmation PDFs
-- (bank statement / payment proof). Separate from invoice-pdfs (proforma/invoice docs).
-- Run in Supabase SQL Editor if payment proof upload fails with "Bucket not found" or RLS.
-- ============================================================================

-- Create bucket (public so payment_proof_url links work without signed URLs)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('payment-proofs', 'payment-proofs', true, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Allow uploads (INSERT) to payment-proofs bucket
DROP POLICY IF EXISTS "Allow upload payment proofs" ON storage.objects;
CREATE POLICY "Allow upload payment proofs"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'payment-proofs');

-- Allow reads (SELECT) so payment_proof_url links work
DROP POLICY IF EXISTS "Allow read payment proofs" ON storage.objects;
CREATE POLICY "Allow read payment proofs"
ON storage.objects FOR SELECT
USING (bucket_id = 'payment-proofs');
