-- SQL #1 — add_second_company_to_properties (run in Supabase SQL Editor)
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS second_company JSONB;
COMMENT ON COLUMN public.properties.second_company IS 'Card 1: second company (2-ga firma) — same structure as tenant (name, address, phones, emails, iban, paymentDayOfMonth).';
