-- Apartment groups: reference table for grouping properties. Used in Card 1 (property details).
CREATE TABLE IF NOT EXISTS public.apartment_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT apartment_groups_name_not_empty CHECK (length(trim(name)) > 0)
);

COMMENT ON TABLE public.apartment_groups IS 'Card 1: apartment group label; dropdown + add-group flow. Unique by normalized name.';

-- Unique by normalized name (case and trim).
CREATE UNIQUE INDEX IF NOT EXISTS apartment_groups_name_unique_lower_trim
  ON public.apartment_groups (lower(trim(name)));

-- Trigger to keep updated_at correct on UPDATE.
CREATE OR REPLACE FUNCTION public.set_apartment_groups_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS apartment_groups_updated_at ON public.apartment_groups;
CREATE TRIGGER apartment_groups_updated_at
  BEFORE UPDATE ON public.apartment_groups
  FOR EACH ROW EXECUTE PROCEDURE public.set_apartment_groups_updated_at();

-- FK on properties.
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS apartment_group_id UUID REFERENCES public.apartment_groups(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.properties.apartment_group_id IS 'Card 1: selected apartment group.';

CREATE INDEX IF NOT EXISTS idx_properties_apartment_group_id ON public.properties (apartment_group_id);

-- RLS: allow authenticated users to read/insert/update (same pattern as other reference tables).
ALTER TABLE public.apartment_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "apartment_groups_select_authenticated" ON public.apartment_groups;
CREATE POLICY "apartment_groups_select_authenticated"
  ON public.apartment_groups FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "apartment_groups_insert_authenticated" ON public.apartment_groups;
CREATE POLICY "apartment_groups_insert_authenticated"
  ON public.apartment_groups FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "apartment_groups_update_authenticated" ON public.apartment_groups;
CREATE POLICY "apartment_groups_update_authenticated"
  ON public.apartment_groups FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);
