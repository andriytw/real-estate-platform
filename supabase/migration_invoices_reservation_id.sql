-- ============================================================================
-- Migration: Add reservation_id to invoices (proformas link to reservations;
-- booking_id is only set after payment is confirmed and a booking is created)
-- Run in Supabase SQL Editor.
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'reservation_id'
    ) THEN
        ALTER TABLE public.invoices
        ADD COLUMN reservation_id UUID REFERENCES public.reservations(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_invoices_reservation_id ON public.invoices(reservation_id);
