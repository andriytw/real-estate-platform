-- ============================================================================
-- Migration: Human-Readable Offer Numbers (OFF-YYYY-000001)
-- Run this in Supabase SQL Editor. Idempotent: safe to run multiple times.
-- ============================================================================

-- STEP 1: Add offer_no column to offers if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'offers'
        AND column_name = 'offer_no'
    ) THEN
        ALTER TABLE public.offers
        ADD COLUMN offer_no TEXT;
    END IF;
END $$;

-- STEP 2: Create offer_counters table (year -> last_value)
CREATE TABLE IF NOT EXISTS public.offer_counters (
    year INTEGER NOT NULL PRIMARY KEY,
    last_value INTEGER NOT NULL DEFAULT 0
);

-- STEP 3: Function to generate offer number atomically
CREATE OR REPLACE FUNCTION public.generate_offer_no(
    p_created_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_year INTEGER;
    v_counter INTEGER;
    v_offer_no TEXT;
BEGIN
    v_year := EXTRACT(YEAR FROM COALESCE(p_created_at, NOW()));
    INSERT INTO public.offer_counters (year, last_value)
    VALUES (v_year, 1)
    ON CONFLICT (year)
    DO UPDATE SET last_value = offer_counters.last_value + 1
    RETURNING last_value INTO v_counter;
    v_offer_no := 'OFF-' || v_year || '-' || LPAD(v_counter::TEXT, 6, '0');
    RETURN v_offer_no;
END;
$$;

-- STEP 4: Trigger function to set offer_no on INSERT
CREATE OR REPLACE FUNCTION public.set_offer_no()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.offer_no IS NULL OR NEW.offer_no = '' THEN
        NEW.offer_no := public.generate_offer_no(NEW.created_at);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_offer_no ON public.offers;
CREATE TRIGGER trg_set_offer_no
    BEFORE INSERT ON public.offers
    FOR EACH ROW
    EXECUTE FUNCTION public.set_offer_no();

-- STEP 5: Backfill existing offers (set offer_no, then sync counter so next insert gets correct number)
WITH numbered AS (
    SELECT id,
           'OFF-' || EXTRACT(YEAR FROM COALESCE(created_at, NOW()))::TEXT || '-' ||
           LPAD(ROW_NUMBER() OVER (PARTITION BY EXTRACT(YEAR FROM COALESCE(created_at, NOW())) ORDER BY created_at ASC NULLS LAST, id)::TEXT, 6, '0') AS no
    FROM public.offers
    WHERE offer_no IS NULL OR offer_no = ''
)
UPDATE public.offers o
SET offer_no = n.no
FROM numbered n
WHERE o.id = n.id;

-- Sync offer_counters so next generate_offer_no() returns correct value per year
INSERT INTO public.offer_counters (year, last_value)
SELECT EXTRACT(YEAR FROM COALESCE(created_at, NOW()))::INTEGER,
       COALESCE(MAX(CAST(SUBSTRING(offer_no FROM 10 FOR 6) AS INTEGER)), 0)
FROM public.offers
WHERE offer_no IS NOT NULL AND offer_no ~ '^OFF-[0-9]{4}-[0-9]{6}$'
GROUP BY EXTRACT(YEAR FROM COALESCE(created_at, NOW()))
ON CONFLICT (year)
DO UPDATE SET last_value = GREATEST(offer_counters.last_value, EXCLUDED.last_value);

-- Optional: unique index so offer_no is unique
CREATE UNIQUE INDEX IF NOT EXISTS idx_offers_offer_no
ON public.offers(offer_no)
WHERE offer_no IS NOT NULL;
