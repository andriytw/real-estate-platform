-- ============================================================================
-- Migration: Storage bucket "invoice-pdfs" for proforma/invoice PDF uploads
-- Run in Supabase SQL Editor if PDF upload fails with "Bucket not found" or RLS.
-- ============================================================================

-- Create bucket (public so file_url links work without signed URLs)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('invoice-pdfs', 'invoice-pdfs', true, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Allow uploads (INSERT) to invoice-pdfs bucket
DROP POLICY IF EXISTS "Allow upload invoice PDFs" ON storage.objects;
CREATE POLICY "Allow upload invoice PDFs"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'invoice-pdfs');

-- Allow reads (SELECT) so file_url links work
DROP POLICY IF EXISTS "Allow read invoice PDFs" ON storage.objects;
CREATE POLICY "Allow read invoice PDFs"
ON storage.objects FOR SELECT
USING (bucket_id = 'invoice-pdfs');
