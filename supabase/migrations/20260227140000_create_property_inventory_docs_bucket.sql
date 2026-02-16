-- Storage bucket for Property Inventory OCR documents (per-apartment).
-- Idempotent: safe to run multiple times.
-- Apply in all envs (Dev/Stage/Prod).

-- Bucket (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'property-inventory-docs',
  'property-inventory-docs',
  false,
  10485760,
  ARRAY['application/pdf', 'image/png', 'image/jpeg']
)
ON CONFLICT (id) DO UPDATE
SET name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Policies (on storage.objects)
DROP POLICY IF EXISTS "property_inventory_docs_read" ON storage.objects;
CREATE POLICY "property_inventory_docs_read"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'property-inventory-docs');

DROP POLICY IF EXISTS "property_inventory_docs_upload" ON storage.objects;
CREATE POLICY "property_inventory_docs_upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'property-inventory-docs');

-- Optional delete (for document/file removal)
DROP POLICY IF EXISTS "property_inventory_docs_delete" ON storage.objects;
CREATE POLICY "property_inventory_docs_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'property-inventory-docs');
