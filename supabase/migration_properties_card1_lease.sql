-- Migration: Card 1 lease fields (landlord, management, apartment_status)
-- Adds JSONB columns for landlord and management contacts, and apartment_status for lease state.

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS landlord JSONB,
  ADD COLUMN IF NOT EXISTS management JSONB,
  ADD COLUMN IF NOT EXISTS apartment_status TEXT DEFAULT 'active' CHECK (apartment_status IN ('active', 'ooo', 'preparation', 'rented_worker'));

COMMENT ON COLUMN public.properties.landlord IS 'Landlord contact (Card 1): name, address, phones[], emails[], iban.';
COMMENT ON COLUMN public.properties.management IS 'Management company contact (Card 1): name, address, phones[], emails[].';
COMMENT ON COLUMN public.properties.apartment_status IS 'Lease/apartment status for Card 1: active, ooo, preparation, rented_worker.';

-- Existing rows get apartment_status = 'active' from DEFAULT.
