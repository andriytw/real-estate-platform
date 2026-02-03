-- Migration: Add amenities (Ausstattung) to properties and backfill from building
-- Card 2 edits only details + amenities; building stays read-only in Card 3.
-- Single source of truth: after this, Card 2 does NOT depend on building for these flags.

-- 1. Add column
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS amenities JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.properties.amenities IS 'Unit amenities (Ausstattung) as key-value booleans; keys from approved list.';

-- 2. Backfill from building: map existing building fields into amenities (existing amenities keys are preserved)
-- building.elevator = 'Yes' -> Aufzug, building.access = 'Yes' -> Barrierefrei, building.kitchen = 'Yes' -> Kochmöglichkeit
UPDATE public.properties
SET amenities = (
  jsonb_build_object(
    'Aufzug', COALESCE((building->>'elevator') = 'Yes', false),
    'Barrierefrei', COALESCE((building->>'access') = 'Yes', false),
    'Kochmöglichkeit', COALESCE((building->>'kitchen') = 'Yes', false)
  )
  || COALESCE(amenities, '{}'::jsonb)
)
WHERE building IS NOT NULL;

-- Where building is null, ensure amenities is at least {}
UPDATE public.properties
SET amenities = COALESCE(amenities, '{}'::jsonb)
WHERE amenities IS NULL;
