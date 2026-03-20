-- Command idempotency ledger for Vercel /api/commands/* (race-safe retries).
-- Document flow columns for partial-failure visibility (optional; server sets when using new routes).

CREATE TABLE IF NOT EXISTS public.command_idempotency (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  command TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'failed')),
  result_json JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, command, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_command_idempotency_user_cmd ON public.command_idempotency (user_id, command);

COMMENT ON TABLE public.command_idempotency IS 'Server-side idempotency for Vercel command routes; keyed per user + command + client key.';

ALTER TABLE public.command_idempotency ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS; deny direct client access by default
DROP POLICY IF EXISTS "command_idempotency_no_direct" ON public.command_idempotency;
CREATE POLICY "command_idempotency_no_direct" ON public.command_idempotency
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- Invoices: orchestration status for upload/DB ordering (NULL = legacy finalized row)
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS orchestration_status TEXT;

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS chk_invoices_orchestration_status;

ALTER TABLE public.invoices
  ADD CONSTRAINT chk_invoices_orchestration_status
  CHECK (
    orchestration_status IS NULL
    OR orchestration_status IN ('pending', 'uploaded', 'finalized', 'failed')
  );

COMMENT ON COLUMN public.invoices.orchestration_status IS 'Server command flow: pending/uploaded/finalized/failed; NULL = legacy or finalized outside orchestration.';

-- Payment proofs: tie optional idempotency key for confirm-payment retries
ALTER TABLE public.payment_proofs
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS payment_proofs_invoice_idempotency_uq
  ON public.payment_proofs (invoice_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN public.payment_proofs.idempotency_key IS 'Client idempotency key for confirm-payment; unique per invoice when set.';
