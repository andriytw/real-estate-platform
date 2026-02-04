-- Migration: property_documents table + RLS (idempotent)
-- Used by Card 1 Documents Center for property-level documents (lease, handover, suppliers, deposit proofs, etc.)
--
-- Create Supabase Storage bucket "property-docs" manually in Dashboard (private) or via CLI;
-- this migration does not manage storage buckets.

-- ============================================================================
-- TABLE: property_documents
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.property_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  file_path TEXT NOT NULL,
  title TEXT,
  doc_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_property_documents_property_created
  ON public.property_documents(property_id, created_at DESC);

COMMENT ON TABLE public.property_documents IS 'Property-level documents (Card 1): lease, handover, suppliers, deposit proofs. File stored in storage bucket property-docs.';

-- RLS: access only if user can access the parent property (mirrors properties table RLS via EXISTS)
ALTER TABLE public.property_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "All authenticated read property_documents" ON public.property_documents;
DROP POLICY IF EXISTS "Properties admin full access property_documents" ON public.property_documents;

-- SELECT: only rows whose property the user can read (RLS on properties applies in subquery)
CREATE POLICY "property_documents_select_via_property"
  ON public.property_documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = property_documents.property_id
    )
  );

-- INSERT: only if user can access the property (new row's property_id)
CREATE POLICY "property_documents_insert_via_property"
  ON public.property_documents FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = property_documents.property_id
    )
  );

-- DELETE: only if user can access the property
CREATE POLICY "property_documents_delete_via_property"
  ON public.property_documents FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = property_documents.property_id
    )
  );
