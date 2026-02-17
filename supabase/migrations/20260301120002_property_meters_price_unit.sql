-- Add unit and price_per_unit to property_meters for footer Price/Sum rows.
-- Idempotent: ADD COLUMN IF NOT EXISTS.

ALTER TABLE public.property_meters ADD COLUMN IF NOT EXISTS unit text NULL;
ALTER TABLE public.property_meters ADD COLUMN IF NOT EXISTS price_per_unit numeric NULL;

COMMENT ON COLUMN public.property_meters.unit IS 'Display unit e.g. kWh, m³, u.';
COMMENT ON COLUMN public.property_meters.price_per_unit IS 'Price per unit for cost calculation (currency in UI).';
