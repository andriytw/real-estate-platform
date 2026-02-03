-- ============================================================================
-- Super Manager (role = 'super_manager') can do everything on all main tables.
-- Use for at@herorooms.de and any super admin. Other RLS policies still apply;
-- super_manager policies add full access in addition to department-based rules.
-- PREREQUISITE: migration_rls_phase1_sales_tables.sql, migration_rls_phase2_financial_tables.sql,
--              migration_payment_proofs_table.sql (tables and existing policies exist)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_super_manager()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role = 'super_manager'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_super_manager() TO authenticated, anon;

-- Phase 1 tables (Sales full, Managers read) — add Super Manager full access
DROP POLICY IF EXISTS "Super manager full access to reservations" ON public.reservations;
CREATE POLICY "Super manager full access to reservations" ON public.reservations
  FOR ALL USING (public.is_super_manager()) WITH CHECK (public.is_super_manager());

DROP POLICY IF EXISTS "Super manager full access to offers" ON public.offers;
CREATE POLICY "Super manager full access to offers" ON public.offers
  FOR ALL USING (public.is_super_manager()) WITH CHECK (public.is_super_manager());

DROP POLICY IF EXISTS "Super manager full access to leads" ON public.leads;
CREATE POLICY "Super manager full access to leads" ON public.leads
  FOR ALL USING (public.is_super_manager()) WITH CHECK (public.is_super_manager());

DROP POLICY IF EXISTS "Super manager full access to requests" ON public.requests;
CREATE POLICY "Super manager full access to requests" ON public.requests
  FOR ALL USING (public.is_super_manager()) WITH CHECK (public.is_super_manager());

DROP POLICY IF EXISTS "Super manager full access to clients" ON public.clients;
CREATE POLICY "Super manager full access to clients" ON public.clients
  FOR ALL USING (public.is_super_manager()) WITH CHECK (public.is_super_manager());

DROP POLICY IF EXISTS "Super manager full access to chat_rooms" ON public.chat_rooms;
CREATE POLICY "Super manager full access to chat_rooms" ON public.chat_rooms
  FOR ALL USING (public.is_super_manager()) WITH CHECK (public.is_super_manager());

DROP POLICY IF EXISTS "Super manager full access to messages" ON public.messages;
CREATE POLICY "Super manager full access to messages" ON public.messages
  FOR ALL USING (public.is_super_manager()) WITH CHECK (public.is_super_manager());

-- Phase 2 tables (Accounting full, Sales/Managers read) — add Super Manager full access
DROP POLICY IF EXISTS "Super manager full access to invoices" ON public.invoices;
CREATE POLICY "Super manager full access to invoices" ON public.invoices
  FOR ALL USING (public.is_super_manager()) WITH CHECK (public.is_super_manager());

DROP POLICY IF EXISTS "Super manager full access to bookings" ON public.bookings;
CREATE POLICY "Super manager full access to bookings" ON public.bookings
  FOR ALL USING (public.is_super_manager()) WITH CHECK (public.is_super_manager());

-- Payment proofs
DROP POLICY IF EXISTS "Super manager full access to payment_proofs" ON public.payment_proofs;
CREATE POLICY "Super manager full access to payment_proofs" ON public.payment_proofs
  FOR ALL USING (public.is_super_manager()) WITH CHECK (public.is_super_manager());

-- Phase 4: properties, companies, rooms (reference data)
DROP POLICY IF EXISTS "Super manager full access to properties" ON public.properties;
CREATE POLICY "Super manager full access to properties" ON public.properties
  FOR ALL USING (public.is_super_manager()) WITH CHECK (public.is_super_manager());

DROP POLICY IF EXISTS "Super manager full access to companies" ON public.companies;
CREATE POLICY "Super manager full access to companies" ON public.companies
  FOR ALL USING (public.is_super_manager()) WITH CHECK (public.is_super_manager());

DROP POLICY IF EXISTS "Super manager full access to rooms" ON public.rooms;
CREATE POLICY "Super manager full access to rooms" ON public.rooms
  FOR ALL USING (public.is_super_manager()) WITH CHECK (public.is_super_manager());

-- Phase 3: facility/operational (calendar_events, warehouse, items, etc.)
DROP POLICY IF EXISTS "Super manager full access to calendar_events" ON public.calendar_events;
CREATE POLICY "Super manager full access to calendar_events" ON public.calendar_events
  FOR ALL USING (public.is_super_manager()) WITH CHECK (public.is_super_manager());

DROP POLICY IF EXISTS "Super manager full access to items" ON public.items;
CREATE POLICY "Super manager full access to items" ON public.items
  FOR ALL USING (public.is_super_manager()) WITH CHECK (public.is_super_manager());

DROP POLICY IF EXISTS "Super manager full access to warehouses" ON public.warehouses;
CREATE POLICY "Super manager full access to warehouses" ON public.warehouses
  FOR ALL USING (public.is_super_manager()) WITH CHECK (public.is_super_manager());

DROP POLICY IF EXISTS "Super manager full access to warehouse_stock" ON public.warehouse_stock;
CREATE POLICY "Super manager full access to warehouse_stock" ON public.warehouse_stock
  FOR ALL USING (public.is_super_manager()) WITH CHECK (public.is_super_manager());

DROP POLICY IF EXISTS "Super manager full access to stock_movements" ON public.stock_movements;
CREATE POLICY "Super manager full access to stock_movements" ON public.stock_movements
  FOR ALL USING (public.is_super_manager()) WITH CHECK (public.is_super_manager());

DROP POLICY IF EXISTS "Super manager full access to warehouse_invoices" ON public.warehouse_invoices;
CREATE POLICY "Super manager full access to warehouse_invoices" ON public.warehouse_invoices
  FOR ALL USING (public.is_super_manager()) WITH CHECK (public.is_super_manager());

DROP POLICY IF EXISTS "Super manager full access to warehouse_invoice_lines" ON public.warehouse_invoice_lines;
CREATE POLICY "Super manager full access to warehouse_invoice_lines" ON public.warehouse_invoice_lines
  FOR ALL USING (public.is_super_manager()) WITH CHECK (public.is_super_manager());
