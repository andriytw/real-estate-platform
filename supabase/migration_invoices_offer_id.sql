-- Migration: Ensure invoices table has offer_id FK
-- Note: offer_id may already exist in schema, but ensure it's properly set up

-- Add offer_id if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'invoices' 
    AND column_name = 'offer_id'
  ) THEN
    ALTER TABLE public.invoices
    ADD COLUMN offer_id UUID REFERENCES public.offers(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Ensure offer_id has index
CREATE INDEX IF NOT EXISTS idx_invoices_offer_id ON public.invoices(offer_id);

-- Note: offer_id should be set when invoice is created from an offer
-- This is handled in the frontend/service layer
