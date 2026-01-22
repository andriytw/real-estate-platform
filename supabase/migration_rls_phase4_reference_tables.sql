-- Migration: Phase 4 - RLS for Reference Data and System Tables
-- Implements RLS policies for properties, companies, rooms, and system tables
-- Reference data: read-only for most, write access for admin/properties department
-- System tables: function-only access
--
-- PREREQUISITE: Run all previous phases first
-- (uses helper functions from previous phases)

-- ============================================================================
-- HELPER FUNCTION: Check if user is admin or in properties department
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_properties_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND (
      role = 'super_manager'
      OR department = 'properties'
    )
  );
$$;

-- ============================================================================
-- PROPERTIES TABLE
-- ============================================================================

-- Drop existing permissive policy
DROP POLICY IF EXISTS "Allow all operations on properties" ON public.properties;

-- All authenticated users: read access (needed for calendar, sales, etc.)
CREATE POLICY "All authenticated read properties" ON public.properties
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Properties department / Admin: full access
CREATE POLICY "Properties admin full access" ON public.properties
  FOR ALL
  USING (public.is_properties_admin())
  WITH CHECK (public.is_properties_admin());

-- ============================================================================
-- COMPANIES TABLE
-- ============================================================================

-- Drop existing permissive policy
DROP POLICY IF EXISTS "Allow all operations on companies" ON public.companies;

-- All authenticated users: read access (needed for invoices, booking numbers)
CREATE POLICY "All authenticated read companies" ON public.companies
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Admin only: write access (seed data, rarely changes)
CREATE POLICY "Admin write companies" ON public.companies
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role = 'super_manager'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role = 'super_manager'
    )
  );

-- ============================================================================
-- ROOMS TABLE
-- ============================================================================

-- Drop existing permissive policy
DROP POLICY IF EXISTS "Allow all operations on rooms" ON public.rooms;

-- All authenticated users: read access (if still used)
CREATE POLICY "All authenticated read rooms" ON public.rooms
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Properties department / Admin: full access
CREATE POLICY "Properties admin full access to rooms" ON public.rooms
  FOR ALL
  USING (public.is_properties_admin())
  WITH CHECK (public.is_properties_admin());

-- ============================================================================
-- BOOKING_COUNTERS TABLE (System table)
-- ============================================================================

-- Drop existing permissive policy if exists
DROP POLICY IF EXISTS "Allow all operations on booking_counters" ON public.booking_counters;

-- Disable RLS on booking_counters (server-only access via function)
-- The generate_booking_no() function runs as SECURITY DEFINER and can access this table
ALTER TABLE public.booking_counters DISABLE ROW LEVEL SECURITY;

-- Note: If you prefer to keep RLS enabled, you can create a policy that only allows
-- the function to access it, but disabling RLS is simpler for system tables

-- ============================================================================
-- TASK_WORKFLOWS TABLE (if exists)
-- ============================================================================

-- Drop existing permissive policy if exists
DROP POLICY IF EXISTS "Workers can manage own workflows" ON public.task_workflows;
DROP POLICY IF EXISTS "Workers can update own workflows" ON public.task_workflows;
DROP POLICY IF EXISTS "Managers can view workflows in department" ON public.task_workflows;

-- Workers: manage own workflows
CREATE POLICY "Workers manage own workflows" ON public.task_workflows
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role = 'worker'
      AND id = task_workflows.worker_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role = 'worker'
      AND id = task_workflows.worker_id
    )
  );

-- Managers: view department workflows
CREATE POLICY "Managers view department workflows" ON public.task_workflows
  FOR SELECT
  USING (
    public.is_manager() AND
    EXISTS (
      SELECT 1 FROM public.calendar_events ce
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE ce.id = task_workflows.task_id
      AND (ce.department = p.department OR ce.department IS NULL)
    )
  );

-- ============================================================================
-- TASK_CHAT_MESSAGES TABLE (if exists)
-- ============================================================================

-- Drop existing permissive policy if exists
DROP POLICY IF EXISTS "Users can view messages for their tasks" ON public.task_chat_messages;
DROP POLICY IF EXISTS "Users can send messages" ON public.task_chat_messages;

-- Users: access messages for tasks they can access
CREATE POLICY "Users access task messages" ON public.task_chat_messages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.task_workflows tw
      JOIN public.calendar_events ce ON ce.id = tw.task_id
      WHERE tw.id = task_chat_messages.workflow_id
      AND (
        tw.worker_id = auth.uid()
        OR ce.manager_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid()
          AND (
            role = 'super_manager'
            OR (role = 'manager' AND department = ce.department)
          )
        )
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.task_workflows tw
      JOIN public.calendar_events ce ON ce.id = tw.task_id
      WHERE tw.id = task_chat_messages.workflow_id
      AND (
        tw.worker_id = auth.uid()
        OR ce.manager_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid()
          AND (
            role = 'super_manager'
            OR (role = 'manager' AND department = ce.department)
          )
        )
      )
    )
  );

-- Grant execute on helper function
GRANT EXECUTE ON FUNCTION public.is_properties_admin() TO authenticated, anon;
