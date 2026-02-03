-- ============================================================================
-- Add document_number to payment_proofs (confirmation number, e.g. PAY-2026-000001)
-- PREREQUISITE: migration_payment_proofs_table.sql
-- ============================================================================

ALTER TABLE public.payment_proofs
ADD COLUMN IF NOT EXISTS document_number text;

-- Optional backfill for existing rows so UI shows a value (window function in subquery only)
UPDATE public.payment_proofs p
SET document_number = 'PAY-' || to_char(p.created_at, 'YYYY') || '-' || lpad(sub.n::text, 6, '0')
FROM (
  SELECT id, row_number() OVER (ORDER BY created_at) AS n
  FROM public.payment_proofs
  WHERE document_number IS NULL
) sub
WHERE p.id = sub.id AND p.document_number IS NULL;
