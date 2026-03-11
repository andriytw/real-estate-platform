-- Offer-first lead: link offers to leads when offer is sent (Save & Send).
-- One lead per multi-apartment offer; all offer rows in the group share the same lead_id.

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_offers_lead_id ON public.offers(lead_id) WHERE lead_id IS NOT NULL;
