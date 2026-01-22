# RLS Migration Audit Report
**Date**: Based on actual SQL files in repository
**Status**: Pre-migration validation

---

## 1. Helper Functions - Exact SQL

### `is_sales_user()`

**File**: `supabase/migration_rls_phase1_sales_tables.sql` (lines 10-21)

```sql
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
```

**Facts**:
- ✅ Has `SECURITY DEFINER`
- ❌ **MISSING**: `SET search_path` (security risk)
- ✅ Has `STABLE` (correct for read-only function)
- ✅ Grants: `GRANT EXECUTE ON FUNCTION public.is_sales_user() TO authenticated, anon;` (line 189)

### `is_accounting_user()`

**File**: `supabase/migration_rls_phase2_financial_tables.sql` (lines 13-24)

```sql
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
```

**Facts**:
- ✅ Has `SECURITY DEFINER`
- ❌ **MISSING**: `SET search_path` (security risk)
- ✅ Has `STABLE`
- ✅ Grants: `GRANT EXECUTE ON FUNCTION public.is_accounting_user() TO authenticated, anon;` (line 79)

### `is_manager()`

**File**: `supabase/migration_rls_phase1_sales_tables.sql` (lines 26-37)

```sql
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
```

**Facts**:
- ✅ Has `SECURITY DEFINER`
- ❌ **MISSING**: `SET search_path` (security risk)
- ✅ Has `STABLE`
- ✅ Grants: `GRANT EXECUTE ON FUNCTION public.is_manager() TO authenticated, anon;` (line 190)

---

## 2. RPC Function `mark_invoice_paid_and_confirm_booking` - Exact SQL

**File**: `supabase/migration_rls_fix_rpc_security.sql` (lines 7-205)

### Function Definition

```sql
CREATE OR REPLACE FUNCTION public.mark_invoice_paid_and_confirm_booking(
  p_invoice_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER  -- Run with permissions of function owner (bypasses RLS)
SET search_path = public  -- Prevent search_path attacks
AS $$
-- ... function body ...
END;
$$;
```

**Facts**:
- ✅ Has `SECURITY DEFINER` (line 11)
- ✅ Has `SET search_path = public` (line 12)
- ❌ **CRITICAL MISSING**: No permission check inside function
- ❌ **CRITICAL**: Grants execution to `authenticated, anon` (line 205) - **ANYONE can execute**

### Current Grant Statement

```sql
-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.mark_invoice_paid_and_confirm_booking(UUID) TO authenticated, anon;
```

**Problem**: This allows ANY authenticated user to execute the function, not just accounting.

### Required Fix

The function should check permissions BEFORE executing:

```sql
CREATE OR REPLACE FUNCTION public.mark_invoice_paid_and_confirm_booking(
  p_invoice_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- ... variables ...
BEGIN
  -- PERMISSION CHECK: Only accounting can execute
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND department = 'accounting'
  ) THEN
    RAISE EXCEPTION 'Only accounting department can mark invoices as paid';
  END IF;
  
  -- ... rest of function ...
END;
$$;

-- REVOKE from all, then grant only to accounting
REVOKE EXECUTE ON FUNCTION public.mark_invoice_paid_and_confirm_booking(UUID) FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.mark_invoice_paid_and_confirm_booking(UUID) TO authenticated;
-- Note: Still grant to authenticated, but function checks department internally
```

---

## 3. Profiles RLS Validation

**File**: `supabase/migration_rls_ensure_profiles_secure.sql`

### Current Policies

```sql
-- Policy 1: Users can view own profile
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Policy 2: Users can update own profile (with role/department protection)
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND (OLD.role = NEW.role AND OLD.department = NEW.department)
  );

-- Policy 3: Managers can view department profiles
CREATE POLICY "Managers can view department profiles" ON public.profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('manager', 'super_manager')
      AND (p.role = 'super_manager' OR p.department = profiles.department)
    )
  );
```

### How Helper Functions Access Profiles Under RLS

**Fact**: Helper functions use `SECURITY DEFINER`, which means:
- They run with the permissions of the function owner (usually `postgres` role)
- They **bypass RLS** on the `profiles` table
- This is **CORRECT** because:
  1. Functions need to read profiles to check user permissions
  2. If functions were subject to RLS, they couldn't read profiles for users checking their own permissions
  3. The functions only read, never modify profiles

**Validation**:
- ✅ Helper functions can read profiles even if caller can't (due to SECURITY DEFINER)
- ✅ This prevents circular dependency: policies need profiles, profiles policies need to be checked
- ⚠️ **Risk**: If function owner is compromised, all RLS is bypassed (mitigated by Supabase's managed service)

---

## 4. Verification SQL Queries

### 4.1 List All Tables with RLS Enabled

```sql
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

### 4.2 List All Policies

```sql
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
```

### 4.3 Find Permissive Policies (USING(true) or WITH CHECK(true))

```sql
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
```

### 4.4 Check Helper Functions Security Settings

```sql
SELECT 
  p.proname as function_name,
  pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN ('is_sales_user', 'is_accounting_user', 'is_manager')
ORDER BY p.proname;
```

### 4.5 Check RPC Function Security Settings

```sql
SELECT 
  p.proname as function_name,
  p.prosecdef as is_security_definer,
  pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname = 'mark_invoice_paid_and_confirm_booking';
```

### 4.6 Check Function Permissions

```sql
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
```

---

## 5. Company Boundary Analysis

### Current State: NO Company Isolation

**Fact from schema.sql**:
- `bookings` table has `company_id UUID` (added in migration_booking_numbers.sql line 21)
- `bookings` table has `internal_company TEXT` (schema.sql line 104)
- `offers` table has `internal_company TEXT NOT NULL` (schema.sql line 122)
- `invoices` table has `internal_company TEXT NOT NULL` (schema.sql line 146)
- `reservations` table has **NO company_id or internal_company** (migration_create_reservations.sql)

### Tables WITHOUT Company Tracking

1. **`reservations`** - Missing company identifier
2. **`properties`** - Missing company identifier
3. **`leads`** - Missing company identifier
4. **`requests`** - Missing company identifier
5. **`clients`** - Missing company identifier
6. **`chat_rooms`** - Missing company identifier
7. **`messages`** - Missing company identifier
8. **`calendar_events`** - Missing company identifier
9. **`items`** - Missing company identifier
10. **`warehouses`** - Missing company identifier
11. **`warehouse_stock`** - Missing company identifier
12. **`stock_movements`** - Missing company identifier
13. **`warehouse_invoices`** - Missing company identifier
14. **`warehouse_invoice_lines`** - Missing company identifier

### Current RLS Policies Do NOT Enforce Company Boundaries

**Example from reservations policy**:
```sql
CREATE POLICY "Sales full access to reservations" ON public.reservations
  FOR ALL
  USING (public.is_sales_user())
  WITH CHECK (public.is_sales_user());
```

**Problem**: This allows sales users to access ALL reservations across ALL companies.

### Required Changes for Company Isolation

If multi-company isolation is required, you need:

1. **Add `company_id UUID REFERENCES companies(id)` to all tables** (or use `internal_company TEXT` consistently)

2. **Update helper functions to check company**:
```sql
CREATE OR REPLACE FUNCTION public.is_sales_user_same_company(p_company_id UUID)
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
    AND company_id = p_company_id  -- Requires company_id in profiles
  );
$$;
```

3. **Update policies to filter by company**:
```sql
CREATE POLICY "Sales access same company reservations" ON public.reservations
  FOR ALL
  USING (
    public.is_sales_user() 
    AND company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_sales_user() 
    AND company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );
```

### Current Assumption

**Based on code analysis**: The platform appears to be **single-company** (all data belongs to one company). The `internal_company` field is used for **display/invoice purposes**, not for access control.

**If this is correct**: Current RLS policies are sufficient (department-based, not company-based).

**If multi-company is required**: Major schema changes needed (add `company_id` to all tables + profiles, update all policies).

---

## Summary of Issues Found

### Critical Issues

1. ❌ **RPC function has no permission check** - Anyone authenticated can execute
2. ❌ **Helper functions missing `SET search_path`** - Security risk (search_path injection)

### Medium Issues

3. ⚠️ **No company isolation** - If multi-company is required, policies don't enforce it
4. ⚠️ **`reservations` table missing company identifier** - Inconsistent with other tables

### Recommendations

1. **Add permission check to RPC function** (see section 2)
2. **Add `SET search_path = public` to all helper functions**
3. **Decide on company isolation requirement** - if needed, add `company_id` to all tables
4. **Add `company_id` to `reservations` table** for consistency
