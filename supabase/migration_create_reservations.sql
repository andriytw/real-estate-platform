-- Migration: Create reservations table (holds/leads)
-- Reservations allow overlaps - multiple holds for same property/dates
-- Only confirmed bookings (created when invoice paid) block overlaps

CREATE TABLE IF NOT EXISTS public.reservations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'offered', 'invoiced', 'won', 'lost', 'cancelled')),
  lead_label TEXT, -- Shown on calendar hold bar (e.g., "At recycling" or client name)
  client_first_name TEXT,
  client_last_name TEXT,
  client_email TEXT,
  client_phone TEXT,
  client_address TEXT,
  guests_count INTEGER DEFAULT 1,
  price_per_night_net NUMERIC(10,2),
  tax_rate NUMERIC(5,2) DEFAULT 19,
  total_nights INTEGER,
  total_gross NUMERIC(10,2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_reservations_property_id ON public.reservations(property_id);
CREATE INDEX IF NOT EXISTS idx_reservations_dates ON public.reservations(property_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON public.reservations(status);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_reservations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_reservations_updated_at
  BEFORE UPDATE ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_reservations_updated_at();

-- RLS Policies (allow all for now, adjust for production)
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on reservations" ON public.reservations
  FOR ALL
  USING (true)
  WITH CHECK (true);
