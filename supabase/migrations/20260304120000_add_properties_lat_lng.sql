-- Add lat/lng and geocode metadata to properties (additive, nullable only)
-- For market map markers and Haversine distance from search point

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision,
  ADD COLUMN IF NOT EXISTS geocoded_at timestamptz,
  ADD COLUMN IF NOT EXISTS geocode_provider text,
  ADD COLUMN IF NOT EXISTS geocode_confidence text,
  ADD COLUMN IF NOT EXISTS geocode_failed_reason text;

ALTER TABLE public.properties
  DROP CONSTRAINT IF EXISTS properties_lat_lng_check;

ALTER TABLE public.properties
  ADD CONSTRAINT properties_lat_lng_check
  CHECK (
    (lat IS NULL OR (lat >= -90 AND lat <= 90)) AND
    (lng IS NULL OR (lng >= -180 AND lng <= 180))
  );

CREATE INDEX IF NOT EXISTS properties_lat_lng_idx ON public.properties (lat, lng);
