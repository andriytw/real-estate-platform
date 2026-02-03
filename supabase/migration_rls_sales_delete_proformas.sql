-- ============================================================================
-- Allow Sales to delete: proformas, child invoices, offers, reservations.
-- So "Видалити" in Payments / Offers / Reservations actually persists.
-- PREREQUISITE: migration_rls_phase2_financial_tables.sql (invoices),
--              migration_rls_phase1_sales_tables.sql (offers, reservations, is_sales_user)
-- ============================================================================

-- Invoices: proformas (Payments table) and child invoices (expand row)
DROP POLICY IF EXISTS "Sales delete proformas" ON public.invoices;
CREATE POLICY "Sales delete proformas" ON public.invoices
  FOR DELETE
  USING (public.is_sales_user() AND document_type = 'proforma');

DROP POLICY IF EXISTS "Sales delete child invoices" ON public.invoices;
CREATE POLICY "Sales delete child invoices" ON public.invoices
  FOR DELETE
  USING (public.is_sales_user() AND document_type = 'invoice');

-- Offers: explicit DELETE so "Delete" on offer row persists
DROP POLICY IF EXISTS "Sales delete offers" ON public.offers;
CREATE POLICY "Sales delete offers" ON public.offers
  FOR DELETE
  USING (public.is_sales_user());

-- Reservations: explicit DELETE so reservation delete persists
DROP POLICY IF EXISTS "Sales delete reservations" ON public.reservations;
CREATE POLICY "Sales delete reservations" ON public.reservations
  FOR DELETE
  USING (public.is_sales_user());
