-- Storage bucket for property expense invoices. Idempotent.
-- Path pattern: property/{propertyId}/{documentId}/{safeFileName}

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'property-expense-docs',
  'property-expense-docs',
  false,
  10485760,
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/jpg']
)
ON CONFLICT (id) DO UPDATE
SET name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

DROP POLICY IF EXISTS "property_expense_docs_read" ON storage.objects;
CREATE POLICY "property_expense_docs_read"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'property-expense-docs');

DROP POLICY IF EXISTS "property_expense_docs_upload" ON storage.objects;
CREATE POLICY "property_expense_docs_upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'property-expense-docs');

DROP POLICY IF EXISTS "property_expense_docs_delete" ON storage.objects;
CREATE POLICY "property_expense_docs_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'property-expense-docs');
