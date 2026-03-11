-- ============================================================================
-- Extend public.offers for multi-apartment: one logical offer = N rows
-- (same offer_no and offer_group_id). Assumes public.offers already exists.
-- ============================================================================

-- 1. REVISE offer_no UNIQUE: multiple rows in the same logical multi-apartment
--    offer share the same offer_no, so offer_no must NOT be unique on offers.
--    In this repo uniqueness is enforced only by UNIQUE INDEX idx_offers_offer_no.
--    Defensive: also drop any UNIQUE CONSTRAINT on offer_no (e.g. if added manually).
DROP INDEX IF EXISTS public.idx_offers_offer_no;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid AND t.relname = 'offers'
    JOIN pg_namespace n ON n.oid = t.relnamespace AND n.nspname = 'public'
    WHERE c.contype = 'u'
      AND array_length(c.conkey, 1) = 1
      AND (SELECT a.attname FROM pg_attribute a
           WHERE a.attrelid = c.conrelid AND a.attnum = c.conkey[1] AND NOT a.attisdropped) = 'offer_no'
  LOOP
    EXECUTE format('ALTER TABLE public.offers DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

-- RPC so app can get next offer_no for a group (uses existing generate_offer_no)
CREATE OR REPLACE FUNCTION public.get_next_offer_no()
RETURNS TEXT
LANGUAGE sql
AS $$
  SELECT public.generate_offer_no();
$$;

-- Add columns to offers (all nullable for backward compatibility)
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS offer_group_id UUID,
  ADD COLUMN IF NOT EXISTS item_status TEXT,
  ADD COLUMN IF NOT EXISTS street_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS house_number_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS zip_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS city_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS apartment_code_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS apartment_group_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS nightly_price NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS nights INTEGER,
  ADD COLUMN IF NOT EXISTS net_total NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS vat_total NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS gross_total NUMERIC(12,2);

CREATE INDEX IF NOT EXISTS idx_offers_offer_group_id ON public.offers(offer_group_id) WHERE offer_group_id IS NOT NULL;
