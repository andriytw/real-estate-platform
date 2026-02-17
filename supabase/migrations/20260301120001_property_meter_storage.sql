-- Storage bucket for meter reading photos (property_meter_photos).
-- Idempotent: safe to run multiple times.
-- Policies: owner-based (auth.uid()) for authenticated users.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'property-meter-photos',
  'property-meter-photos',
  false,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

DROP POLICY IF EXISTS "property_meter_photos_select" ON storage.objects;
CREATE POLICY "property_meter_photos_select"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'property-meter-photos' AND owner = auth.uid());

DROP POLICY IF EXISTS "property_meter_photos_insert" ON storage.objects;
CREATE POLICY "property_meter_photos_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'property-meter-photos' AND owner = auth.uid());

DROP POLICY IF EXISTS "property_meter_photos_delete" ON storage.objects;
CREATE POLICY "property_meter_photos_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'property-meter-photos' AND owner = auth.uid());
