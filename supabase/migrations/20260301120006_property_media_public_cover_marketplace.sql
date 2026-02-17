-- MP-PROD-01: Public read for cover photo only (marketplace cards + property hero).
-- Do NOT drop existing owner policies; only ADD public cover policies.

-- A) Column + index
ALTER TABLE public.property_media_assets
ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_property_media_assets_public
ON public.property_media_assets(property_id, type, is_public);

-- B) RLS: ADD policy for public cover rows (keep property_media_assets_select_own)
CREATE POLICY property_media_assets_select_public_cover
ON public.property_media_assets
FOR SELECT
TO public
USING (is_public = true);

-- C) Storage: ADD policy for anon/public cover objects (keep property_media_select)
CREATE POLICY property_media_select_public_cover
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'property-media'
  AND EXISTS (
    SELECT 1
    FROM public.property_media_assets a
    WHERE a.storage_path = name
      AND a.is_public = true
  )
);
