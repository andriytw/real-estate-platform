-- ============================================================================
-- Allow Sales to delete proformas (invoices with document_type = 'proforma')
-- so that "Видалити" on the Payments table actually persists.
-- PREREQUISITE: migration_rls_phase2_financial_tables.sql (Sales has SELECT only on invoices)
-- ============================================================================

CREATE POLICY "Sales delete proformas" ON public.invoices
  FOR DELETE
  USING (public.is_sales_user() AND document_type = 'proforma');
