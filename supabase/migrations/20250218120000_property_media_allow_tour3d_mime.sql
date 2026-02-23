-- Allow tour3d file formats (GLB, OBJ, IFC, USDZ) in property-media bucket.
-- Additive: append types without erasing any existing (e.g. image/gif).
-- model/vnd.usdz+zip: browser often sends this for .usdz; allow so upload never fails.

UPDATE storage.buckets b
SET allowed_mime_types = (
  SELECT array(
    SELECT DISTINCT x
    FROM unnest(
      coalesce(b.allowed_mime_types, '{}'::text[])
      || array[
        'model/gltf-binary',
        'application/octet-stream',
        'model/vnd.usdz+zip'
      ]::text[]
    ) t(x)
    ORDER BY x
  )
)
WHERE b.id = 'property-media';
