-- Migration: Add marketplace_url to properties table

ALTER TABLE public.properties
ADD COLUMN IF NOT EXISTS marketplace_url TEXT;

-- Index for marketplace_url lookups (optional, but useful if filtering by URL)
CREATE INDEX IF NOT EXISTS idx_properties_marketplace_url ON public.properties(marketplace_url)
WHERE marketplace_url IS NOT NULL;
