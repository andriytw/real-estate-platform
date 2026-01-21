-- Migration: Add source tracking fields to bookings table
-- Bookings are confirmed only (created when invoice is paid)
-- Track the chain: invoice → offer → reservation

-- Add source fields
ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS source_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL;

ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS source_offer_id UUID REFERENCES public.offers(id) ON DELETE SET NULL;

ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS source_reservation_id UUID REFERENCES public.reservations(id) ON DELETE SET NULL;

-- Indexes for source fields
CREATE INDEX IF NOT EXISTS idx_bookings_source_invoice_id ON public.bookings(source_invoice_id);
CREATE INDEX IF NOT EXISTS idx_bookings_source_offer_id ON public.bookings(source_offer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_source_reservation_id ON public.bookings(source_reservation_id);
