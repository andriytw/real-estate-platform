-- Add kaution (deposit) column to offers table for multi-apartment offer modal.
-- Kaution is persisted per offer row and used in Gross (Gross = Net + VAT + Kaution).
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS kaution NUMERIC(12,2) DEFAULT 0;

COMMENT ON COLUMN public.offers.kaution IS 'Deposit amount per apartment; not taxable; included in gross total.';
