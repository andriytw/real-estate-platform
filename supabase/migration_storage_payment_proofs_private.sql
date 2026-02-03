-- ============================================================================
-- Step 2: Make payment-proofs bucket PRIVATE and restrict storage access
-- to staff only (Accounting, Sales, Managers). Run AFTER UI uses signed URLs
-- everywhere (Step 1). Existing public URLs will stop working after this.
--
-- PREREQUISITE: migration_rls_phase2_financial_tables.sql (is_accounting_user)
-- and migration_rls_phase1_sales_tables.sql (is_sales_user, is_manager)
-- ============================================================================

-- Set bucket to private (signed URLs only)
UPDATE storage.buckets
SET public = false
WHERE id = 'payment-proofs';

-- Drop permissive policies
DROP POLICY IF EXISTS "Allow upload payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Allow read payment proofs" ON storage.objects;

-- Staff-only SELECT: Accounting, Sales, Managers
CREATE POLICY "Staff read payment-proofs bucket"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'payment-proofs'
  AND (
    public.is_accounting_user()
    OR public.is_sales_user()
    OR public.is_manager()
  )
);

-- Staff-only INSERT
CREATE POLICY "Staff insert payment-proofs bucket"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'payment-proofs'
  AND (
    public.is_accounting_user()
    OR public.is_sales_user()
    OR public.is_manager()
  )
);

-- Staff-only UPDATE
CREATE POLICY "Staff update payment-proofs bucket"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'payment-proofs'
  AND (
    public.is_accounting_user()
    OR public.is_sales_user()
    OR public.is_manager()
  )
)
WITH CHECK (
  bucket_id = 'payment-proofs'
  AND (
    public.is_accounting_user()
    OR public.is_sales_user()
    OR public.is_manager()
  )
);
