-- Migration: property_deposit_proofs — Kaution (deposit) proof documents only (idempotent)
-- Independent from property_documents. Used only by Card 1 "Застава (Kaution)" block.
-- Files stored in existing bucket "property-docs" under deposit_proofs/{property_id}/{proof_type}/...

-- ============================================================================
-- TABLE: property_deposit_proofs
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.property_deposit_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  proof_type TEXT NOT NULL CHECK (proof_type IN ('payment', 'return')),
  bucket TEXT NOT NULL,
  file_path TEXT NOT NULL,
  original_filename TEXT,
  mime_type TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_property_deposit_proofs_property_type_created
  ON public.property_deposit_proofs(property_id, proof_type, created_at DESC);

COMMENT ON TABLE public.property_deposit_proofs IS 'Kaution (deposit) proof files only. Independent from property_documents. Used by Card 1 Застава block.';

-- RLS
ALTER TABLE public.property_deposit_proofs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "property_deposit_proofs_select_via_property" ON public.property_deposit_proofs;
CREATE POLICY "property_deposit_proofs_select_via_property"
  ON public.property_deposit_proofs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = property_deposit_proofs.property_id
    )
  );

DROP POLICY IF EXISTS "property_deposit_proofs_insert_via_property" ON public.property_deposit_proofs;
CREATE POLICY "property_deposit_proofs_insert_via_property"
  ON public.property_deposit_proofs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = property_deposit_proofs.property_id
    )
  );

DROP POLICY IF EXISTS "property_deposit_proofs_delete_via_property" ON public.property_deposit_proofs;
CREATE POLICY "property_deposit_proofs_delete_via_property"
  ON public.property_deposit_proofs FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = property_deposit_proofs.property_id
    )
  );
