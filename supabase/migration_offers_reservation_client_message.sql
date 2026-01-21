-- Migration: Update offers table
-- Add reservation_id FK and client_message field
-- Expand status values

-- Add reservation_id column
ALTER TABLE public.offers
ADD COLUMN IF NOT EXISTS reservation_id UUID REFERENCES public.reservations(id) ON DELETE SET NULL;

-- Add client_message column (separate from internal comments)
ALTER TABLE public.offers
ADD COLUMN IF NOT EXISTS client_message TEXT;

-- Drop old status constraint
ALTER TABLE public.offers
DROP CONSTRAINT IF EXISTS offers_status_check;

-- Add new status constraint with expanded values
ALTER TABLE public.offers
ADD CONSTRAINT offers_status_check
CHECK (status IN ('Draft', 'Sent', 'Invoiced', 'Accepted', 'Lost', 'Rejected', 'Expired'));

-- Index for reservation_id
CREATE INDEX IF NOT EXISTS idx_offers_reservation_id ON public.offers(reservation_id);

-- Update existing offers: if status is 'Invoiced', keep it; otherwise default to 'Sent' if not 'Draft'
UPDATE public.offers
SET status = CASE
  WHEN status = 'Invoiced' THEN 'Invoiced'
  WHEN status = 'Draft' THEN 'Draft'
  ELSE 'Sent'
END
WHERE status NOT IN ('Draft', 'Sent', 'Invoiced');
