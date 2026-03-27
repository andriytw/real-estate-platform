-- Add persistent planning price per room source-of-truth for apartment planning
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS planning_price_per_room numeric(10,2) NOT NULL DEFAULT 0;

ALTER TABLE public.properties
  DROP CONSTRAINT IF EXISTS properties_planning_price_per_room_non_negative;

ALTER TABLE public.properties
  ADD CONSTRAINT properties_planning_price_per_room_non_negative
  CHECK (planning_price_per_room >= 0);
