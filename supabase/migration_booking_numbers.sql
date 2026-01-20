-- ============================================================================
-- Migration: Human-Readable Booking Numbers (RES-YYYY-000001)
-- Run this in Supabase SQL Editor
-- Idempotent: Safe to run multiple times
-- ============================================================================

-- STEP 1: Add company_id column to bookings if it doesn't exist
DO $$
DECLARE
    default_company_id UUID;
    company_count INTEGER;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'bookings' 
        AND column_name = 'company_id'
    ) THEN
        -- Add company_id column (nullable initially for backfill)
        ALTER TABLE public.bookings 
        ADD COLUMN company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;
        
        -- Determine default company: use first company in companies table
        -- Raise exception if companies table is empty
        SELECT COUNT(*) INTO company_count FROM public.companies;
        
        IF company_count = 0 THEN
            RAISE EXCEPTION 'No rows in public.companies. Create a company first, then rerun migration.';
        END IF;
        
        -- Use first company (ordered by created_at)
        SELECT id INTO default_company_id 
        FROM public.companies 
        ORDER BY created_at ASC 
        LIMIT 1;
        
        -- Backfill existing bookings with default company
        UPDATE public.bookings 
        SET company_id = default_company_id 
        WHERE company_id IS NULL;
        
        -- Now make it NOT NULL
        ALTER TABLE public.bookings 
        ALTER COLUMN company_id SET NOT NULL;
    END IF;
END $$;

-- STEP 2: Add booking_no column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'bookings' 
        AND column_name = 'booking_no'
    ) THEN
        ALTER TABLE public.bookings 
        ADD COLUMN booking_no TEXT;
    END IF;
END $$;

-- STEP 3: Create booking_counters table
CREATE TABLE IF NOT EXISTS public.booking_counters (
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    last_value INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (company_id, year)
);

-- STEP 4: Create function to generate booking number atomically
CREATE OR REPLACE FUNCTION public.generate_booking_no(
    p_company_id UUID,
    p_created_at TIMESTAMP WITH TIME ZONE
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_year INTEGER;
    v_counter INTEGER;
    v_booking_no TEXT;
BEGIN
    -- Extract year from created_at (or use current year if null)
    v_year := EXTRACT(YEAR FROM COALESCE(p_created_at, NOW()));
    
    -- Atomically increment counter using INSERT...ON CONFLICT
    INSERT INTO public.booking_counters (company_id, year, last_value)
    VALUES (p_company_id, v_year, 1)
    ON CONFLICT (company_id, year) 
    DO UPDATE SET last_value = booking_counters.last_value + 1
    RETURNING last_value INTO v_counter;
    
    -- Format: RES-YYYY-000001 (6 digits, zero-padded)
    v_booking_no := 'RES-' || v_year || '-' || LPAD(v_counter::TEXT, 6, '0');
    
    RETURN v_booking_no;
END;
$$;

-- STEP 5: Create trigger function to set booking_no on INSERT
CREATE OR REPLACE FUNCTION public.set_booking_no()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Only set booking_no if it's NULL or empty string (allows manual override if needed)
    IF NEW.booking_no IS NULL OR NEW.booking_no = '' THEN
        NEW.booking_no := public.generate_booking_no(
            COALESCE(NEW.company_id, (SELECT id FROM public.companies ORDER BY created_at ASC LIMIT 1)),
            COALESCE(NEW.created_at, NOW())
        );
    END IF;
    
    RETURN NEW;
END;
$$;

-- STEP 6: Create trigger (drop and recreate to ensure it's correct)
DROP TRIGGER IF EXISTS trg_set_booking_no ON public.bookings;

CREATE TRIGGER trg_set_booking_no
    BEFORE INSERT ON public.bookings
    FOR EACH ROW
    EXECUTE FUNCTION public.set_booking_no();

-- STEP 7: Create UNIQUE index on booking_no
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_booking_no 
ON public.bookings(booking_no) 
WHERE booking_no IS NOT NULL;

-- STEP 8: Backfill existing bookings that don't have booking_no
DO $$
DECLARE
    booking_rec RECORD;
    v_booking_no TEXT;
    v_company_id UUID;
    v_year INTEGER;
    v_counter INTEGER;
BEGIN
    -- Process bookings ordered by created_at to maintain sequential numbering
    FOR booking_rec IN 
        SELECT id, company_id, created_at, start_date
        FROM public.bookings
        WHERE booking_no IS NULL
        ORDER BY COALESCE(created_at, NOW()) ASC
    LOOP
        -- Determine company_id (should not be NULL after step 1, but handle edge case)
        v_company_id := COALESCE(
            booking_rec.company_id,
            (SELECT id FROM public.companies ORDER BY created_at ASC LIMIT 1)
        );
        
        -- Determine year from created_at or start_date
        v_year := EXTRACT(YEAR FROM COALESCE(booking_rec.created_at, booking_rec.start_date, NOW()));
        
        -- Atomically get next counter value
        INSERT INTO public.booking_counters (company_id, year, last_value)
        VALUES (v_company_id, v_year, 1)
        ON CONFLICT (company_id, year) 
        DO UPDATE SET last_value = booking_counters.last_value + 1
        RETURNING last_value INTO v_counter;
        
        -- Generate booking number
        v_booking_no := 'RES-' || v_year || '-' || LPAD(v_counter::TEXT, 6, '0');
        
        -- Update booking
        UPDATE public.bookings
        SET booking_no = v_booking_no
        WHERE id = booking_rec.id;
    END LOOP;
END $$;

-- STEP 9: After backfill, make booking_no NOT NULL for new rows (optional constraint)
-- Note: We keep it nullable to allow manual override if needed, but trigger ensures it's always set

-- Verification query (uncomment to check):
-- SELECT 
--     COUNT(*) as total_bookings,
--     COUNT(booking_no) as bookings_with_number,
--     MIN(booking_no) as first_booking_no,
--     MAX(booking_no) as last_booking_no
-- FROM public.bookings;
