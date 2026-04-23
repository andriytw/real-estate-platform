-- Allow certain property_documents (e.g. ZVU) to exist without an attached file.
-- This is intentionally narrow: app logic still requires file_path for most types.

ALTER TABLE public.property_documents
  ALTER COLUMN file_path DROP NOT NULL;

