-- Add second company (2-ga firma) column to properties. Same structure as tenant JSONB.
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS second_company JSONB;
COMMENT ON COLUMN public.properties.second_company IS 'Card 1: second company (2-ga firma) — same structure as tenant (name, address, phones, emails, iban, paymentDayOfMonth).';
