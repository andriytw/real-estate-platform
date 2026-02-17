-- Storage bucket for property media (photos, PDFs). Owner-based policies.
-- Idempotent: safe to run multiple times.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'property-media',
  'property-media',
  false,
  52428800,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

DROP POLICY IF EXISTS "property_media_select" ON storage.objects;
CREATE POLICY "property_media_select"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'property-media' AND owner = auth.uid());

DROP POLICY IF EXISTS "property_media_insert" ON storage.objects;
CREATE POLICY "property_media_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'property-media' AND owner = auth.uid());

DROP POLICY IF EXISTS "property_media_delete" ON storage.objects;
CREATE POLICY "property_media_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'property-media' AND owner = auth.uid());
