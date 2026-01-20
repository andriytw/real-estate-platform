-- Migration: Add client_message to offers and marketplace_url to properties
-- Created: 2025-01-XX
-- Description: 
--   - Adds client_message TEXT to offers table for client-facing messages
--   - Adds marketplace_url TEXT (nullable) to properties table for public listing URLs

-- STEP 1: Add client_message to offers table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'offers' 
        AND column_name = 'client_message'
    ) THEN
        ALTER TABLE public.offers 
        ADD COLUMN client_message TEXT;
        
        COMMENT ON COLUMN public.offers.client_message IS 'Client-facing message sent via email/WhatsApp. Separate from comments (internal notes).';
    END IF;
END $$;

-- STEP 2: Add marketplace_url to properties table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'properties' 
        AND column_name = 'marketplace_url'
    ) THEN
        ALTER TABLE public.properties 
        ADD COLUMN marketplace_url TEXT;
        
        COMMENT ON COLUMN public.properties.marketplace_url IS 'Public marketplace listing URL (e.g., herorooms.de/market/{property-slug})';
    END IF;
END $$;

-- Verification queries (uncomment to check):
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_schema = 'public' 
-- AND table_name = 'offers' 
-- AND column_name = 'client_message';

-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_schema = 'public' 
-- AND table_name = 'properties' 
-- AND column_name = 'marketplace_url';
