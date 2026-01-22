-- Migration: Fix helper functions to include SET search_path for security
-- All SECURITY DEFINER functions must have SET search_path to prevent search_path injection attacks

-- Fix is_sales_user()
CREATE OR REPLACE FUNCTION public.is_sales_user()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND department = 'sales'
  );
$$;

-- Fix is_accounting_user()
CREATE OR REPLACE FUNCTION public.is_accounting_user()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND department = 'accounting'
  );
$$;

-- Fix is_manager()
CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role IN ('manager', 'super_manager')
  );
$$;

-- Fix is_facility_user()
CREATE OR REPLACE FUNCTION public.is_facility_user()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND department = 'facility'
  );
$$;

-- Fix is_properties_admin()
CREATE OR REPLACE FUNCTION public.is_properties_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
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

-- Fix is_assigned_to_event() if it exists
CREATE OR REPLACE FUNCTION public.is_assigned_to_event(event_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
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
