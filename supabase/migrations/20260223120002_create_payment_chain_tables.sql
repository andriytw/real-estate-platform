-- Payment Chain: normalized edges + file metadata. Source of truth alongside properties.payment_chain JSONB (legacy fallback).
-- RLS: authenticated full access until properties table has RLS; then tighten policies to match.

-- Edges: one row per (property_id, edge_key). Keys: C2_TO_C1, C1_TO_OWNER.
CREATE TABLE IF NOT EXISTS public.payment_chain_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  edge_key TEXT NOT NULL CHECK (edge_key IN ('C2_TO_C1', 'C1_TO_OWNER')),
  pay_by_day_of_month SMALLINT NULL CHECK (pay_by_day_of_month IS NULL OR (pay_by_day_of_month >= 1 AND pay_by_day_of_month <= 31)),
  amount_total NUMERIC(12,2) NULL,
  description TEXT NULL,
  breakdown JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(property_id, edge_key)
);

COMMENT ON TABLE public.payment_chain_edges IS 'Payment chain edges per property. C2_TO_C1 = 2nd company to 1st; C1_TO_OWNER = 1st to owner.';
CREATE INDEX IF NOT EXISTS idx_payment_chain_edges_property_id ON public.payment_chain_edges(property_id);
CREATE INDEX IF NOT EXISTS idx_payment_chain_edges_edge_key ON public.payment_chain_edges(edge_key);

-- Trigger updated_at (set_updated_at created in 20260223120001)
DROP TRIGGER IF EXISTS payment_chain_edges_updated_at ON public.payment_chain_edges;
CREATE TRIGGER payment_chain_edges_updated_at
  BEFORE UPDATE ON public.payment_chain_edges
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- Files: metadata per file. Storage in bucket property-files, path: {propertyId}/payment-chain/{tile_key}/...
CREATE TABLE IF NOT EXISTS public.payment_chain_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  tile_key TEXT NOT NULL CHECK (tile_key IN ('C2_TO_C1', 'C1_TO_OWNER', 'OWNER_RECEIPT')),
  storage_path TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  mime_type TEXT NULL,
  size_bytes BIGINT NULL,
  uploaded_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.payment_chain_files IS 'Payment chain file metadata. Files stored in bucket property-files under payment-chain/ path.';
CREATE INDEX IF NOT EXISTS idx_payment_chain_files_property_id ON public.payment_chain_files(property_id);
CREATE INDEX IF NOT EXISTS idx_payment_chain_files_tile_key ON public.payment_chain_files(tile_key);
CREATE INDEX IF NOT EXISTS idx_payment_chain_files_created_at ON public.payment_chain_files(created_at);

-- RLS
ALTER TABLE public.payment_chain_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_chain_files ENABLE ROW LEVEL SECURITY;

-- Policies: authenticated full access (tighten when properties RLS exists)
DROP POLICY IF EXISTS "payment_chain_edges_select" ON public.payment_chain_edges;
CREATE POLICY "payment_chain_edges_select" ON public.payment_chain_edges FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "payment_chain_edges_insert" ON public.payment_chain_edges;
CREATE POLICY "payment_chain_edges_insert" ON public.payment_chain_edges FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "payment_chain_edges_update" ON public.payment_chain_edges;
CREATE POLICY "payment_chain_edges_update" ON public.payment_chain_edges FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "payment_chain_edges_delete" ON public.payment_chain_edges;
CREATE POLICY "payment_chain_edges_delete" ON public.payment_chain_edges FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "payment_chain_files_select" ON public.payment_chain_files;
CREATE POLICY "payment_chain_files_select" ON public.payment_chain_files FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "payment_chain_files_insert" ON public.payment_chain_files;
CREATE POLICY "payment_chain_files_insert" ON public.payment_chain_files FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "payment_chain_files_update" ON public.payment_chain_files;
CREATE POLICY "payment_chain_files_update" ON public.payment_chain_files FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "payment_chain_files_delete" ON public.payment_chain_files;
CREATE POLICY "payment_chain_files_delete" ON public.payment_chain_files FOR DELETE TO authenticated USING (true);

-- Storage: policy for property-files bucket, payment-chain path only
-- Bucket 'property-files' must already exist (used elsewhere). Restrict to paths containing 'payment-chain'.
DROP POLICY IF EXISTS "property_files_payment_chain_select" ON storage.objects;
CREATE POLICY "property_files_payment_chain_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'property-files' AND (name LIKE '%/payment-chain/%'));

DROP POLICY IF EXISTS "property_files_payment_chain_insert" ON storage.objects;
CREATE POLICY "property_files_payment_chain_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'property-files' AND (name LIKE '%/payment-chain/%'));

DROP POLICY IF EXISTS "property_files_payment_chain_delete" ON storage.objects;
CREATE POLICY "property_files_payment_chain_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'property-files' AND (name LIKE '%/payment-chain/%'));
