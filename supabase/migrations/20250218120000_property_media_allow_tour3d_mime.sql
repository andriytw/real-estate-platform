-- Allow tour3d file formats (GLB, OBJ, IFC, USDZ) in property-media bucket.
-- Additive: append model/gltf-binary and application/octet-stream without erasing
-- any existing types (e.g. image/gif) that may have been added manually.

UPDATE storage.buckets b
SET allowed_mime_types = (
  SELECT array(
    SELECT DISTINCT x
    FROM unnest(
      coalesce(b.allowed_mime_types, '{}'::text[])
      || array['model/gltf-binary', 'application/octet-stream']::text[]
    ) t(x)
    ORDER BY x
  )
)
WHERE b.id = 'property-media';
