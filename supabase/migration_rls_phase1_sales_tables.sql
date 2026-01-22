-- Migration: Phase 1 - Department-Based RLS for Sales Tables
-- Implements proper RLS policies for reservations, offers, leads, requests, clients
-- Sales department: full access
-- Managers: read all, write own department
-- Others: no access

-- ============================================================================
-- HELPER FUNCTION: Check if user is in sales department
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_sales_user()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND department = 'sales'
  );
$$;

-- ============================================================================
-- HELPER FUNCTION: Check if user is manager or super_manager
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role IN ('manager', 'super_manager')
  );
$$;

-- ============================================================================
-- RESERVATIONS TABLE
-- ============================================================================

-- Drop existing permissive policy
DROP POLICY IF EXISTS "Allow all operations on reservations" ON public.reservations;

-- Sales department: full access
CREATE POLICY "Sales full access to reservations" ON public.reservations
  FOR ALL
  USING (public.is_sales_user())
  WITH CHECK (public.is_sales_user());

-- Managers: read all reservations
CREATE POLICY "Managers read reservations" ON public.reservations
  FOR SELECT
  USING (public.is_manager());

-- ============================================================================
-- OFFERS TABLE
-- ============================================================================

-- Drop existing permissive policy
DROP POLICY IF EXISTS "Allow all operations on offers" ON public.offers;

-- Sales department: full access
CREATE POLICY "Sales full access to offers" ON public.offers
  FOR ALL
  USING (public.is_sales_user())
  WITH CHECK (public.is_sales_user());

-- Managers: read all offers
CREATE POLICY "Managers read offers" ON public.offers
  FOR SELECT
  USING (public.is_manager());

-- ============================================================================
-- LEADS TABLE
-- ============================================================================

-- Drop existing permissive policy
DROP POLICY IF EXISTS "Allow all operations on leads" ON public.leads;

-- Sales department: full access
CREATE POLICY "Sales full access to leads" ON public.leads
  FOR ALL
  USING (public.is_sales_user())
  WITH CHECK (public.is_sales_user());

-- Managers: read all leads
CREATE POLICY "Managers read leads" ON public.leads
  FOR SELECT
  USING (public.is_manager());

-- ============================================================================
-- REQUESTS TABLE
-- ============================================================================

-- Drop existing permissive policy
DROP POLICY IF EXISTS "Allow all operations on requests" ON public.requests;

-- Public (anon): can create requests (website forms)
CREATE POLICY "Public can create requests" ON public.requests
  FOR INSERT
  WITH CHECK (true);

-- Sales department: full access
CREATE POLICY "Sales full access to requests" ON public.requests
  FOR ALL
  USING (public.is_sales_user())
  WITH CHECK (public.is_sales_user());

-- Managers: read all requests
CREATE POLICY "Managers read requests" ON public.requests
  FOR SELECT
  USING (public.is_manager());

-- ============================================================================
-- CLIENTS TABLE (if exists)
-- ============================================================================

-- Drop existing permissive policy if exists
DROP POLICY IF EXISTS "Allow all operations on clients" ON public.clients;

-- Sales department: full access
CREATE POLICY "Sales full access to clients" ON public.clients
  FOR ALL
  USING (public.is_sales_user())
  WITH CHECK (public.is_sales_user());

-- Managers: read all clients
CREATE POLICY "Managers read clients" ON public.clients
  FOR SELECT
  USING (public.is_manager());

-- ============================================================================
-- CHAT_ROOMS TABLE (if exists)
-- ============================================================================

-- Drop existing permissive policy if exists
DROP POLICY IF EXISTS "Allow all operations on chat_rooms" ON public.chat_rooms;

-- Sales department: full access to sales chats
CREATE POLICY "Sales full access to chat_rooms" ON public.chat_rooms
  FOR ALL
  USING (public.is_sales_user())
  WITH CHECK (public.is_sales_user());

-- Managers: read department chat rooms
CREATE POLICY "Managers read chat_rooms" ON public.chat_rooms
  FOR SELECT
  USING (public.is_manager());

-- ============================================================================
-- MESSAGES TABLE (if exists)
-- ============================================================================

-- Drop existing permissive policy if exists
DROP POLICY IF EXISTS "Allow all operations on messages" ON public.messages;

-- Sales department: full access to messages in accessible chat rooms
CREATE POLICY "Sales full access to messages" ON public.messages
  FOR ALL
  USING (
    public.is_sales_user() AND
    EXISTS (
      SELECT 1 FROM public.chat_rooms
      WHERE id = messages.chat_room_id
    )
  )
  WITH CHECK (
    public.is_sales_user() AND
    EXISTS (
      SELECT 1 FROM public.chat_rooms
      WHERE id = messages.chat_room_id
    )
  );

-- Managers: read messages in accessible chat rooms
CREATE POLICY "Managers read messages" ON public.messages
  FOR SELECT
  USING (
    public.is_manager() AND
    EXISTS (
      SELECT 1 FROM public.chat_rooms
      WHERE id = messages.chat_room_id
    )
  );

-- Grant execute on helper functions
GRANT EXECUTE ON FUNCTION public.is_sales_user() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_manager() TO authenticated, anon;
