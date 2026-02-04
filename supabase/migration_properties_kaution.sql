-- Migration: Card 1 deposit (Застава/Kaution) — structured deposit data on property (idempotent)
-- Deposit paid by our company to the landlord (master lease). Documents via property_documents (deposit_payment_proof, deposit_return_proof).
-- Do NOT drop data: adds deposit column; copies from kaution if that column existed (legacy).

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS deposit JSONB;

-- Preserve data if migration previously created kaution column
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'properties' AND column_name = 'kaution') THEN
    UPDATE public.properties SET deposit = kaution WHERE kaution IS NOT NULL AND deposit IS NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.properties.deposit IS 'Card 1 Kaution: amount, status (unpaid|paid|partially_returned|returned), paidAt, paidTo, returnedAt, returnedAmount.';
