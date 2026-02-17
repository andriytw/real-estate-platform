-- Property media assets: gallery photos, Magic Plan reports, floor plans, 3D tour URL.
-- RLS: property-owned pattern (same as property_meters / property_meter_readings).

CREATE TABLE IF NOT EXISTS public.property_media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('photo','magic_plan_report','floor_plan','tour3d')),
  file_name text NULL,
  storage_path text NULL,
  mime_type text NULL,
  size_bytes bigint NULL,
  external_url text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_property_media_assets_property_type
  ON public.property_media_assets(property_id, type);

CREATE INDEX IF NOT EXISTS idx_property_media_assets_property_created
  ON public.property_media_assets(property_id, created_at DESC);

COMMENT ON TABLE public.property_media_assets IS 'Media per property: photos, Magic Plan PDFs, floor plan PDFs, 3D tour URL.';

ALTER TABLE public.property_media_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY property_media_assets_select_own
ON public.property_media_assets FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id AND p.user_id = auth.uid()));

CREATE POLICY property_media_assets_insert_own
ON public.property_media_assets FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id AND p.user_id = auth.uid()));

CREATE POLICY property_media_assets_update_own
ON public.property_media_assets FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id AND p.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id AND p.user_id = auth.uid()));

CREATE POLICY property_media_assets_delete_own
ON public.property_media_assets FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id AND p.user_id = auth.uid()));
