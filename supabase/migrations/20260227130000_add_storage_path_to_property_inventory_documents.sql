-- Add storage_path for per-document file in bucket 'property-inventory-docs'
ALTER TABLE public.property_inventory_documents
  ADD COLUMN IF NOT EXISTS storage_path TEXT NULL;

COMMENT ON COLUMN public.property_inventory_documents.storage_path IS 'Path in Storage bucket property-inventory-docs for signed URL (view/download).';
