-- Marketplace property detail: anon can read ALL photo assets (and their storage objects)
-- for a property that has a cover set (cover_photo_asset_id). No self-reference on
-- property_media_assets to avoid RLS infinite recursion; gate uses public.properties only.
-- Idempotent: DROP POLICY IF EXISTS before CREATE.

-- A) RLS: public can SELECT photo rows for properties that have a cover (marketplace-visible)
DROP POLICY IF EXISTS property_media_assets_select_public_gallery ON public.property_media_assets;
CREATE POLICY property_media_assets_select_public_gallery
ON public.property_media_assets
FOR SELECT
TO public
USING (
  type = 'photo'
  AND EXISTS (
    SELECT 1 FROM public.properties p
    WHERE p.id = property_media_assets.property_id
      AND p.cover_photo_asset_id IS NOT NULL
  )
);

-- B) Storage: public can SELECT objects in property-media for those photo assets
DROP POLICY IF EXISTS property_media_select_public_gallery ON storage.objects;
CREATE POLICY property_media_select_public_gallery
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'property-media'
  AND EXISTS (
    SELECT 1
    FROM public.property_media_assets a
    JOIN public.properties p ON p.id = a.property_id
    WHERE a.storage_path = name
      AND a.type = 'photo'
      AND p.cover_photo_asset_id IS NOT NULL
  )
);
