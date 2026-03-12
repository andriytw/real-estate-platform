-- Add kaution_status to invoices for proforma deposit return workflow.
-- Values: not_returned, returned, partially_returned (future-safe).
-- Proformas are invoice rows with document_type = 'proforma'.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS kaution_status TEXT;

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS chk_invoices_kaution_status;

ALTER TABLE public.invoices
  ADD CONSTRAINT chk_invoices_kaution_status
  CHECK (kaution_status IS NULL OR kaution_status IN ('not_returned', 'returned', 'partially_returned'));

COMMENT ON COLUMN public.invoices.kaution_status IS 'Proforma deposit return state: not_returned, returned, or partially_returned (future). NULL treated as not_returned in app.';
