-- ============================================================================
-- Migration: Human-Readable Reservation Numbers (RES-YYYY-000001)
-- Run this in Supabase SQL Editor. Idempotent: safe to run multiple times.
-- ============================================================================

-- STEP 1: Add reservation_no column to reservations if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'reservations'
        AND column_name = 'reservation_no'
    ) THEN
        ALTER TABLE public.reservations
        ADD COLUMN reservation_no TEXT;
    END IF;
END $$;

-- STEP 2: Create reservation_counters table (year -> last_value)
CREATE TABLE IF NOT EXISTS public.reservation_counters (
    year INTEGER NOT NULL PRIMARY KEY,
    last_value INTEGER NOT NULL DEFAULT 0
);

-- STEP 3: Function to generate reservation number atomically
CREATE OR REPLACE FUNCTION public.generate_reservation_no(
    p_created_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_year INTEGER;
    v_counter INTEGER;
    v_reservation_no TEXT;
BEGIN
    v_year := EXTRACT(YEAR FROM COALESCE(p_created_at, NOW()));
    INSERT INTO public.reservation_counters (year, last_value)
    VALUES (v_year, 1)
    ON CONFLICT (year)
    DO UPDATE SET last_value = reservation_counters.last_value + 1
    RETURNING last_value INTO v_counter;
    v_reservation_no := 'RES-' || v_year || '-' || LPAD(v_counter::TEXT, 6, '0');
    RETURN v_reservation_no;
END;
$$;

-- STEP 4: Trigger function to set reservation_no on INSERT
CREATE OR REPLACE FUNCTION public.set_reservation_no()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.reservation_no IS NULL OR NEW.reservation_no = '' THEN
        NEW.reservation_no := public.generate_reservation_no(NEW.created_at);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_reservation_no ON public.reservations;
CREATE TRIGGER trg_set_reservation_no
    BEFORE INSERT ON public.reservations
    FOR EACH ROW
    EXECUTE FUNCTION public.set_reservation_no();

-- STEP 5: Backfill existing reservations (set reservation_no, then sync counter)
WITH numbered AS (
    SELECT id,
           'RES-' || EXTRACT(YEAR FROM COALESCE(created_at, NOW()))::TEXT || '-' ||
           LPAD(ROW_NUMBER() OVER (PARTITION BY EXTRACT(YEAR FROM COALESCE(created_at, NOW())) ORDER BY created_at ASC NULLS LAST, id)::TEXT, 6, '0') AS no
    FROM public.reservations
    WHERE reservation_no IS NULL OR reservation_no = ''
)
UPDATE public.reservations r
SET reservation_no = n.no
FROM numbered n
WHERE r.id = n.id;

-- Sync reservation_counters so next generate_reservation_no() returns correct value per year
INSERT INTO public.reservation_counters (year, last_value)
SELECT EXTRACT(YEAR FROM COALESCE(created_at, NOW()))::INTEGER,
       COALESCE(MAX(CAST(SUBSTRING(reservation_no FROM 10 FOR 6) AS INTEGER)), 0)
FROM public.reservations
WHERE reservation_no IS NOT NULL AND reservation_no ~ '^RES-[0-9]{4}-[0-9]{6}$'
GROUP BY EXTRACT(YEAR FROM COALESCE(created_at, NOW()))
ON CONFLICT (year)
DO UPDATE SET last_value = GREATEST(reservation_counters.last_value, EXCLUDED.last_value);

-- Optional: unique index so reservation_no is unique
CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_reservation_no
ON public.reservations(reservation_no)
WHERE reservation_no IS NOT NULL;
