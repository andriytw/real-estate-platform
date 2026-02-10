-- Persist Payment Chain (Платіжний ланцюжок) per property.
-- JSONB: { owner_control: { payByDayOfMonth?, total, description, breakdown }, from_company1_to_owner: {...}, from_company2_to_company1: {...} }
-- Attachments (files) are not stored; only deadline, total, description, breakdown.

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS payment_chain JSONB DEFAULT NULL;

COMMENT ON COLUMN public.properties.payment_chain IS 'Payment chain (Платіжний ланцюжок). Keys: owner, company1, company2. Each tile: payByDayOfMonth (1-31), total (omit for owner), description, breakdown, attachments (path in property-files bucket).';
