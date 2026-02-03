-- ============================================================================
-- Migration: payment_proofs table (one current proof per invoice; audit history)
-- PREREQUISITE: migration_rls_phase2_financial_tables.sql (is_accounting_user, is_sales_user, is_manager)
-- ============================================================================

-- Table: one row per payment confirmation; PDF optional; is_current = main row "Proof"
CREATE TABLE IF NOT EXISTS public.payment_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  file_path text,
  file_name text,
  file_uploaded_at timestamptz,
  notes text,
  is_current boolean NOT NULL DEFAULT false,
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'replaced', 'void')),
  replaced_by_proof_id uuid REFERENCES public.payment_proofs(id),
  replaces_proof_id uuid REFERENCES public.payment_proofs(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  rpc_confirmed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_payment_proofs_invoice_id ON public.payment_proofs(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_created_at ON public.payment_proofs(created_at DESC);

-- Exactly one current proof per invoice
CREATE UNIQUE INDEX idx_payment_proofs_one_current_per_invoice
  ON public.payment_proofs (invoice_id) WHERE (is_current = true);

-- RLS
ALTER TABLE public.payment_proofs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Accounting full access to payment_proofs" ON public.payment_proofs;
CREATE POLICY "Accounting full access to payment_proofs" ON public.payment_proofs
  FOR ALL
  USING (public.is_accounting_user())
  WITH CHECK (public.is_accounting_user());

DROP POLICY IF EXISTS "Sales read payment_proofs" ON public.payment_proofs;
CREATE POLICY "Sales read payment_proofs" ON public.payment_proofs
  FOR SELECT
  USING (public.is_sales_user());

DROP POLICY IF EXISTS "Sales insert update payment_proofs" ON public.payment_proofs;
CREATE POLICY "Sales insert update payment_proofs" ON public.payment_proofs
  FOR ALL
  USING (public.is_sales_user())
  WITH CHECK (public.is_sales_user());

DROP POLICY IF EXISTS "Managers read payment_proofs" ON public.payment_proofs;
CREATE POLICY "Managers read payment_proofs" ON public.payment_proofs
  FOR SELECT
  USING (public.is_manager());
