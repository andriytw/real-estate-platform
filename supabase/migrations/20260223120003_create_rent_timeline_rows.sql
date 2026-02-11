-- Rent Timeline: owner payment schedule per property. One row per period (no JSONB overwrite = multi-manager safe).
-- TODO: tighten RLS once properties RLS/tenant isolation is finalized.

CREATE TABLE IF NOT EXISTS public.rent_timeline_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  valid_from DATE NOT NULL,
  valid_to DATE NULL,
  tenant_name TEXT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED', 'FUTURE')),
  km NUMERIC(12,2) NOT NULL DEFAULT 0,
  mietsteuer NUMERIC(12,2) NOT NULL DEFAULT 0,
  unternehmenssteuer NUMERIC(12,2) NOT NULL DEFAULT 0,
  bk NUMERIC(12,2) NOT NULL DEFAULT 0,
  hk NUMERIC(12,2) NOT NULL DEFAULT 0,
  muell NUMERIC(12,2) NOT NULL DEFAULT 0,
  strom NUMERIC(12,2) NOT NULL DEFAULT 0,
  gas NUMERIC(12,2) NOT NULL DEFAULT 0,
  wasser NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(property_id, external_id)
);

COMMENT ON TABLE public.rent_timeline_rows IS 'Owner payment schedule (Rent Timeline). One row per period; no tenant/contract coupling.';
CREATE INDEX IF NOT EXISTS idx_rent_timeline_rows_property_id ON public.rent_timeline_rows(property_id);
CREATE INDEX IF NOT EXISTS idx_rent_timeline_rows_property_valid ON public.rent_timeline_rows(property_id, valid_from);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS rent_timeline_rows_updated_at ON public.rent_timeline_rows;
CREATE TRIGGER rent_timeline_rows_updated_at
  BEFORE UPDATE ON public.rent_timeline_rows
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.rent_timeline_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rent_timeline_rows_select" ON public.rent_timeline_rows;
CREATE POLICY "rent_timeline_rows_select" ON public.rent_timeline_rows FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "rent_timeline_rows_insert" ON public.rent_timeline_rows;
CREATE POLICY "rent_timeline_rows_insert" ON public.rent_timeline_rows FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "rent_timeline_rows_update" ON public.rent_timeline_rows;
CREATE POLICY "rent_timeline_rows_update" ON public.rent_timeline_rows FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "rent_timeline_rows_delete" ON public.rent_timeline_rows;
CREATE POLICY "rent_timeline_rows_delete" ON public.rent_timeline_rows FOR DELETE TO authenticated USING (true);
