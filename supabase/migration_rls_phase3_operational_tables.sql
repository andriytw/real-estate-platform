-- Migration: Phase 3 - Department-Based RLS for Operational Tables
-- Implements RLS policies for facility/operational tables
-- Facility: full access to facility data
-- Managers: read department data
-- Workers: read/write assigned tasks only
--
-- PREREQUISITE: Run migration_rls_phase1_sales_tables.sql and migration_rls_phase2_financial_tables.sql first
-- (uses is_manager() and is_accounting_user() functions)

-- ============================================================================
-- HELPER FUNCTION: Check if user is in facility department
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_facility_user()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND department = 'facility'
  );
$$;

-- ============================================================================
-- HELPER FUNCTION: Check if user is assigned to a calendar event
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_assigned_to_event(event_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.calendar_events
    WHERE id = event_id
    AND (
      assigned_worker_id = auth.uid()::TEXT
      OR worker_id = auth.uid()::TEXT
      OR manager_id = auth.uid()
    )
  );
$$;

-- ============================================================================
-- CALENDAR_EVENTS TABLE
-- ============================================================================

-- Drop existing permissive policy
DROP POLICY IF EXISTS "Allow all operations on calendar_events" ON public.calendar_events;

-- Facility department: full access to facility events
CREATE POLICY "Facility full access to facility events" ON public.calendar_events
  FOR ALL
  USING (
    public.is_facility_user() AND
    (department = 'facility' OR department IS NULL)
  )
  WITH CHECK (
    public.is_facility_user() AND
    (department = 'facility' OR department IS NULL)
  );

-- Workers: read/write assigned events only
CREATE POLICY "Workers manage assigned events" ON public.calendar_events
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role = 'worker'
    )
    AND (
      assigned_worker_id = auth.uid()::TEXT
      OR worker_id = auth.uid()::TEXT
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role = 'worker'
    )
    AND (
      assigned_worker_id = auth.uid()::TEXT
      OR worker_id = auth.uid()::TEXT
    )
  );

-- All authenticated: read all events (for calendar view)
CREATE POLICY "All authenticated read calendar_events" ON public.calendar_events
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Managers: full access to department events
CREATE POLICY "Managers manage department events" ON public.calendar_events
  FOR ALL
  USING (
    public.is_manager() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND (
        calendar_events.department = profiles.department
        OR calendar_events.department IS NULL
      )
    )
  )
  WITH CHECK (
    public.is_manager() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND (
        calendar_events.department = profiles.department
        OR calendar_events.department IS NULL
      )
    )
  );

-- ============================================================================
-- ITEMS TABLE (Warehouse catalog)
-- ============================================================================

-- Drop existing permissive policy
DROP POLICY IF EXISTS "Allow all operations on items" ON public.items;

-- Facility department: full access
CREATE POLICY "Facility full access to items" ON public.items
  FOR ALL
  USING (public.is_facility_user())
  WITH CHECK (public.is_facility_user());

-- All authenticated: read-only (for reference)
CREATE POLICY "All authenticated read items" ON public.items
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- ============================================================================
-- WAREHOUSES TABLE
-- ============================================================================

-- Drop existing permissive policy
DROP POLICY IF EXISTS "Allow all operations on warehouses" ON public.warehouses;

-- Facility department: full access
CREATE POLICY "Facility full access to warehouses" ON public.warehouses
  FOR ALL
  USING (public.is_facility_user())
  WITH CHECK (public.is_facility_user());

-- All authenticated: read-only
CREATE POLICY "All authenticated read warehouses" ON public.warehouses
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- ============================================================================
-- WAREHOUSE_STOCK TABLE
-- ============================================================================

-- Drop existing permissive policy
DROP POLICY IF EXISTS "Allow all operations on warehouse_stock" ON public.warehouse_stock;

-- Facility department: full access
CREATE POLICY "Facility full access to warehouse_stock" ON public.warehouse_stock
  FOR ALL
  USING (public.is_facility_user())
  WITH CHECK (public.is_facility_user());

-- All authenticated: read-only
CREATE POLICY "All authenticated read warehouse_stock" ON public.warehouse_stock
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- ============================================================================
-- STOCK_MOVEMENTS TABLE (Audit trail)
-- ============================================================================

-- Drop existing permissive policy
DROP POLICY IF EXISTS "Allow all operations on stock_movements" ON public.stock_movements;

-- Facility department: full access (can create movements)
CREATE POLICY "Facility full access to stock_movements" ON public.stock_movements
  FOR ALL
  USING (public.is_facility_user())
  WITH CHECK (public.is_facility_user());

-- All authenticated: read-only (audit trail)
CREATE POLICY "All authenticated read stock_movements" ON public.stock_movements
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- ============================================================================
-- WAREHOUSE_INVOICES TABLE
-- ============================================================================

-- Drop existing permissive policy
DROP POLICY IF EXISTS "Allow all operations on warehouse_invoices" ON public.warehouse_invoices;

-- Facility department: full access
CREATE POLICY "Facility full access to warehouse_invoices" ON public.warehouse_invoices
  FOR ALL
  USING (public.is_facility_user())
  WITH CHECK (public.is_facility_user());

-- Accounting department: read/write access (for financial tracking)
CREATE POLICY "Accounting access warehouse_invoices" ON public.warehouse_invoices
  FOR ALL
  USING (public.is_accounting_user())
  WITH CHECK (public.is_accounting_user());

-- ============================================================================
-- WAREHOUSE_INVOICE_LINES TABLE
-- ============================================================================

-- Drop existing permissive policy
DROP POLICY IF EXISTS "Allow all operations on warehouse_invoice_lines" ON public.warehouse_invoice_lines;

-- Facility department: full access
CREATE POLICY "Facility full access to warehouse_invoice_lines" ON public.warehouse_invoice_lines
  FOR ALL
  USING (public.is_facility_user())
  WITH CHECK (public.is_facility_user());

-- Accounting department: read/write access
CREATE POLICY "Accounting access warehouse_invoice_lines" ON public.warehouse_invoice_lines
  FOR ALL
  USING (public.is_accounting_user())
  WITH CHECK (public.is_accounting_user());

-- Grant execute on helper functions
GRANT EXECUTE ON FUNCTION public.is_facility_user() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_assigned_to_event(UUID) TO authenticated, anon;
