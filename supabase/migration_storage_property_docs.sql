-- ============================================================================
-- Storage bucket "property-docs" for Card 1 property documents (lease, deposit proofs, etc.)
-- Run in Supabase SQL Editor once. Idempotent (safe to run again).
-- ============================================================================

-- Create bucket (private: app uses signed URLs via getDocumentSignedUrl)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'property-docs',
  'property-docs',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Allow read (SELECT) — for signed URL / view
DROP POLICY IF EXISTS "Allow read property-docs" ON storage.objects;
CREATE POLICY "Allow read property-docs"
ON storage.objects FOR SELECT
USING (bucket_id = 'property-docs');

-- Allow upload (INSERT)
DROP POLICY IF EXISTS "Allow upload property-docs" ON storage.objects;
CREATE POLICY "Allow upload property-docs"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'property-docs');

-- Allow delete (DELETE) — for document removal
DROP POLICY IF EXISTS "Allow delete property-docs" ON storage.objects;
CREATE POLICY "Allow delete property-docs"
ON storage.objects FOR DELETE
USING (bucket_id = 'property-docs');
