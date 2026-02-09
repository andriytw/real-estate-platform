-- Migration: unit_lease_terms — lease/contract term per property (one row per unit).
-- Independent from rent timeline (rentalHistory). Used by Card 1 "Термін оренди" block.
-- unit_id references properties(id); in code use propertyId.

CREATE TABLE IF NOT EXISTS public.unit_lease_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  contract_start DATE NOT NULL,
  contract_end DATE,
  contract_type TEXT NOT NULL,
  first_payment_date DATE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unit_lease_terms_unit_id_key UNIQUE (unit_id),
  CONSTRAINT unit_lease_terms_contract_type_check CHECK (
    contract_type IN ('befristet', 'unbefristet', 'mit automatischer Verlängerung')
  )
);

COMMENT ON TABLE public.unit_lease_terms IS 'Lease/contract term per property. One row per unit. Not linked to rent timeline.';

ALTER TABLE public.unit_lease_terms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "unit_lease_terms_select_authenticated" ON public.unit_lease_terms;
CREATE POLICY "unit_lease_terms_select_authenticated"
  ON public.unit_lease_terms FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "unit_lease_terms_insert_authenticated" ON public.unit_lease_terms;
CREATE POLICY "unit_lease_terms_insert_authenticated"
  ON public.unit_lease_terms FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "unit_lease_terms_update_authenticated" ON public.unit_lease_terms;
CREATE POLICY "unit_lease_terms_update_authenticated"
  ON public.unit_lease_terms FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "unit_lease_terms_delete_authenticated" ON public.unit_lease_terms;
CREATE POLICY "unit_lease_terms_delete_authenticated"
  ON public.unit_lease_terms FOR DELETE
  TO authenticated
  USING (true);
