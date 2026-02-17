-- Manual-only meter readings: property_meters (Zählernummer per type), property_meter_readings, property_meter_photos (stub).
-- RLS: authenticated can access only rows for properties where p.user_id = auth.uid().
-- Assumes properties.user_id exists (see property expense RLS migration).

-- 1) property_meters: one row per (property_id, type)
CREATE TABLE IF NOT EXISTS public.property_meters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('strom','gas','wasser','heizung')),
  meter_number text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_property_meters_property_type
  ON public.property_meters(property_id, type);

COMMENT ON TABLE public.property_meters IS 'Meter numbers (Zählernummer) per type per property.';

-- 2) property_meter_readings
CREATE TABLE IF NOT EXISTS public.property_meter_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  reading_date date NOT NULL,
  strom numeric NULL,
  gas numeric NULL,
  wasser numeric NULL,
  heizung numeric NULL,
  note text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_property_meter_readings_property_date
  ON public.property_meter_readings(property_id, reading_date DESC);

COMMENT ON TABLE public.property_meter_readings IS 'Manual meter readings per property (date + values + note).';

-- 3) property_meter_photos (stub)
CREATE TABLE IF NOT EXISTS public.property_meter_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reading_id uuid NOT NULL REFERENCES public.property_meter_readings(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.property_meter_photos IS 'Photos attached to a meter reading (stub).';

-- RLS: property_meters
ALTER TABLE public.property_meters ENABLE ROW LEVEL SECURITY;

CREATE POLICY property_meters_select_own
ON public.property_meters FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id AND p.user_id = auth.uid()));

CREATE POLICY property_meters_insert_own
ON public.property_meters FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id AND p.user_id = auth.uid()));

CREATE POLICY property_meters_update_own
ON public.property_meters FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id AND p.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id AND p.user_id = auth.uid()));

CREATE POLICY property_meters_delete_own
ON public.property_meters FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id AND p.user_id = auth.uid()));

-- RLS: property_meter_readings
ALTER TABLE public.property_meter_readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY property_meter_readings_select_own
ON public.property_meter_readings FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id AND p.user_id = auth.uid()));

CREATE POLICY property_meter_readings_insert_own
ON public.property_meter_readings FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id AND p.user_id = auth.uid()));

CREATE POLICY property_meter_readings_update_own
ON public.property_meter_readings FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id AND p.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id AND p.user_id = auth.uid()));

CREATE POLICY property_meter_readings_delete_own
ON public.property_meter_readings FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id AND p.user_id = auth.uid()));

-- RLS: property_meter_photos (via reading -> property)
ALTER TABLE public.property_meter_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY property_meter_photos_select_own
ON public.property_meter_photos FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.property_meter_readings r
    JOIN public.properties p ON p.id = r.property_id
    WHERE r.id = reading_id AND p.user_id = auth.uid()
  )
);

CREATE POLICY property_meter_photos_insert_own
ON public.property_meter_photos FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.property_meter_readings r
    JOIN public.properties p ON p.id = r.property_id
    WHERE r.id = reading_id AND p.user_id = auth.uid()
  )
);

CREATE POLICY property_meter_photos_update_own
ON public.property_meter_photos FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.property_meter_readings r
    JOIN public.properties p ON p.id = r.property_id
    WHERE r.id = reading_id AND p.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.property_meter_readings r
    JOIN public.properties p ON p.id = r.property_id
    WHERE r.id = reading_id AND p.user_id = auth.uid()
  )
);

CREATE POLICY property_meter_photos_delete_own
ON public.property_meter_photos FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.property_meter_readings r
    JOIN public.properties p ON p.id = r.property_id
    WHERE r.id = reading_id AND p.user_id = auth.uid()
  )
);
