-- ============================================================================
-- Allow Sales and Managers (including Super Admin) to delete: proformas, child invoices, offers, reservations.
-- So "Видалити" in Payments / Offers / Reservations actually persists.
-- Who can delete: Sales (department = 'sales') OR is_manager() = manager/super_manager (Super Admin can do everything).
-- PREREQUISITE: migration_rls_phase2_financial_tables.sql (invoices),
--              migration_rls_phase1_sales_tables.sql (offers, reservations, is_sales_user, is_manager)
-- ============================================================================

-- Invoices: proformas (Payments table) and child invoices (expand row)
DROP POLICY IF EXISTS "Sales delete proformas" ON public.invoices;
CREATE POLICY "Sales or manager delete proformas" ON public.invoices
  FOR DELETE
  USING ((public.is_sales_user() OR public.is_manager()) AND document_type = 'proforma');

DROP POLICY IF EXISTS "Sales delete child invoices" ON public.invoices;
CREATE POLICY "Sales or manager delete child invoices" ON public.invoices
  FOR DELETE
  USING ((public.is_sales_user() OR public.is_manager()) AND document_type = 'invoice');

-- Offers: explicit DELETE so "Delete" on offer row persists
DROP POLICY IF EXISTS "Sales delete offers" ON public.offers;
CREATE POLICY "Sales or manager delete offers" ON public.offers
  FOR DELETE
  USING (public.is_sales_user() OR public.is_manager());

-- Reservations: explicit DELETE so reservation delete persists
DROP POLICY IF EXISTS "Sales delete reservations" ON public.reservations;
CREATE POLICY "Sales or manager delete reservations" ON public.reservations
  FOR DELETE
  USING (public.is_sales_user() OR public.is_manager());
