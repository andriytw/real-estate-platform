-- RLS Verification Queries
-- Run these AFTER all migrations to verify RLS is properly configured

-- ============================================================================
-- 1. List All Tables with RLS Enabled
-- ============================================================================
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- ============================================================================
-- 2. List All Policies
-- ============================================================================
SELECT 
  schemaname,
  tablename,
  policyname,
  cmd as command,
  qual as using_expression,
  with_check as with_check_expression,
  roles
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ============================================================================
-- 3. Find Permissive Policies (USING(true) or WITH CHECK(true))
-- These should be ZERO after migration
-- ============================================================================
SELECT 
  schemaname,
  tablename,
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    qual::text = '(true)' 
    OR qual::text LIKE '%true%'
    OR with_check::text = '(true)'
    OR with_check::text LIKE '%true%'
  )
ORDER BY tablename, policyname;

-- ============================================================================
-- 4. Check Helper Functions Security Settings
-- ============================================================================
SELECT 
  p.proname as function_name,
  p.prosecdef as is_security_definer,
  pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN ('is_sales_user', 'is_accounting_user', 'is_manager', 'is_facility_user', 'is_properties_admin')
ORDER BY p.proname;

-- ============================================================================
-- 5. Check RPC Function Security Settings
-- ============================================================================
SELECT 
  p.proname as function_name,
  p.prosecdef as is_security_definer,
  pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname = 'mark_invoice_paid_and_confirm_booking';

-- ============================================================================
-- 6. Check Function Permissions
-- ============================================================================
SELECT 
  p.proname as function_name,
  r.rolname as role,
  has_function_privilege(r.rolname, p.oid, 'EXECUTE') as can_execute
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
CROSS JOIN pg_roles r
WHERE n.nspname = 'public'
  AND p.proname = 'mark_invoice_paid_and_confirm_booking'
  AND r.rolname IN ('authenticated', 'anon', 'postgres')
ORDER BY p.proname, r.rolname;

-- ============================================================================
-- 7. Count Policies Per Table
-- ============================================================================
SELECT 
  tablename,
  COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;

-- ============================================================================
-- 8. Check for Tables Without RLS Enabled (should be minimal)
-- ============================================================================
SELECT 
  t.tablename,
  t.rowsecurity as rls_enabled,
  COUNT(p.policyname) as policy_count
FROM pg_tables t
LEFT JOIN pg_policies p ON t.tablename = p.tablename AND t.schemaname = p.schemaname
WHERE t.schemaname = 'public'
GROUP BY t.tablename, t.rowsecurity
HAVING t.rowsecurity = false OR COUNT(p.policyname) = 0
ORDER BY t.tablename;

-- ============================================================================
-- 9. Verify Helper Functions Have SET search_path
-- ============================================================================
SELECT 
  p.proname as function_name,
  CASE 
    WHEN pg_get_functiondef(p.oid) LIKE '%SET search_path%' THEN 'YES'
    ELSE 'NO - SECURITY RISK'
  END as has_search_path
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN ('is_sales_user', 'is_accounting_user', 'is_manager', 'is_facility_user', 'is_properties_admin', 'mark_invoice_paid_and_confirm_booking')
  AND p.prosecdef = true  -- Only check SECURITY DEFINER functions
ORDER BY p.proname;

-- ============================================================================
-- 10. Test RLS with Current User (run as authenticated user)
-- ============================================================================
-- This query will show what the current user can see
-- Run this while logged in as different user roles to test

SELECT 
  'profiles' as table_name,
  COUNT(*) as visible_rows
FROM public.profiles
UNION ALL
SELECT 
  'reservations',
  COUNT(*)
FROM public.reservations
UNION ALL
SELECT 
  'offers',
  COUNT(*)
FROM public.offers
UNION ALL
SELECT 
  'invoices',
  COUNT(*)
FROM public.invoices
UNION ALL
SELECT 
  'bookings',
  COUNT(*)
FROM public.bookings;
