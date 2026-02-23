-- Allow tour3d formats (OBJ, GLB) in property-media bucket. Runs after bucket creation.
-- Additive: append types without erasing existing (e.g. image/jpeg, application/pdf).

UPDATE storage.buckets b
SET allowed_mime_types = (
  SELECT array(
    SELECT DISTINCT x
    FROM unnest(
      coalesce(b.allowed_mime_types, '{}'::text[])
      || array[
        'application/octet-stream',
        'model/gltf-binary'
      ]::text[]
    ) t(x)
    ORDER BY x
  )
)
WHERE b.id = 'property-media';
