-- Migration: Phase 2 - Strict RLS for Financial Tables
-- Implements strict RLS policies for invoices and bookings
-- Accounting: full access (read/write/delete)
-- Sales: read-only (cannot modify paid invoices or confirmed bookings)
-- Others: no access
--
-- PREREQUISITE: Run migration_rls_phase1_sales_tables.sql first
-- (uses is_sales_user() and is_manager() functions from Phase 1)

-- ============================================================================
-- HELPER FUNCTION: Check if user is in accounting department
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_accounting_user()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND department = 'accounting'
  );
$$;

-- ============================================================================
-- INVOICES TABLE
-- ============================================================================

-- Drop existing permissive policy
DROP POLICY IF EXISTS "Allow all operations on invoices" ON public.invoices;

-- Accounting department: full access (read/write/delete)
CREATE POLICY "Accounting full access to invoices" ON public.invoices
  FOR ALL
  USING (public.is_accounting_user())
  WITH CHECK (public.is_accounting_user());

-- Sales department: read-only access
CREATE POLICY "Sales read invoices" ON public.invoices
  FOR SELECT
  USING (public.is_sales_user());

-- Managers: read-only access
CREATE POLICY "Managers read invoices" ON public.invoices
  FOR SELECT
  USING (public.is_manager());

-- ============================================================================
-- BOOKINGS TABLE
-- ============================================================================

-- Drop existing permissive policy
DROP POLICY IF EXISTS "Allow all operations on bookings" ON public.bookings;

-- Accounting department: full access (read/write/delete)
-- Note: Bookings should normally only be created by RPC, but accounting may need to correct data
CREATE POLICY "Accounting full access to bookings" ON public.bookings
  FOR ALL
  USING (public.is_accounting_user())
  WITH CHECK (public.is_accounting_user());

-- Sales department: read-only access (cannot modify confirmed bookings)
CREATE POLICY "Sales read bookings" ON public.bookings
  FOR SELECT
  USING (public.is_sales_user());

-- All authenticated users: read-only access (for calendar view)
-- This allows facility/other departments to see confirmed bookings
CREATE POLICY "All authenticated read bookings" ON public.bookings
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- RPC function needs to bypass RLS for booking creation
-- The mark_invoice_paid_and_confirm_booking function runs as SECURITY DEFINER
-- so it can insert bookings even with RLS enabled

-- Grant execute on helper function
GRANT EXECUTE ON FUNCTION public.is_accounting_user() TO authenticated, anon;
