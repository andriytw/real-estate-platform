-- Cover photo for property: references property_media_assets (photo type).
-- FK uses DO block because Postgres has no ADD CONSTRAINT IF NOT EXISTS.

-- column
ALTER TABLE public.properties
ADD COLUMN IF NOT EXISTS cover_photo_asset_id uuid NULL;

-- FK (safe, no IF NOT EXISTS for constraints)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'properties_cover_photo_asset_fk'
  ) THEN
    ALTER TABLE public.properties
    ADD CONSTRAINT properties_cover_photo_asset_fk
    FOREIGN KEY (cover_photo_asset_id)
    REFERENCES public.property_media_assets(id)
    ON DELETE SET NULL;
  END IF;
END $$;

-- index
CREATE INDEX IF NOT EXISTS idx_properties_cover_photo_asset_id
ON public.properties(cover_photo_asset_id);
