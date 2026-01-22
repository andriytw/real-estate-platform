# RLS Migration Guide

This directory contains phased migrations to implement proper Row Level Security (RLS) policies for production use.

## Current State

All tables currently have **permissive RLS policies** (`USING (true) WITH CHECK (true)`), which means any authenticated user has full access to all data. This is a **development setup** and must be changed before production.

## Migration Order

**IMPORTANT**: Execute migrations in this exact order:

1. **`migration_rls_ensure_profiles_secure.sql`** (MUST RUN FIRST)
   - Secures the `profiles` table
   - All other RLS policies depend on this table
   - Without this, all other policies will fail

2. **`migration_rls_phase1_sales_tables.sql`**
   - Implements department-based RLS for sales tables
   - Tables: `reservations`, `offers`, `leads`, `requests`, `clients`, `chat_rooms`, `messages`
   - Sales department: full access
   - Managers: read-only
   - Others: no access

3. **`migration_rls_phase2_financial_tables.sql`**
   - Implements strict RLS for financial tables
   - Tables: `invoices`, `bookings`
   - Accounting: full access
   - Sales: read-only
   - Others: read-only (for calendar view)

4. **`migration_rls_phase3_operational_tables.sql`**
   - Implements department-based RLS for operational tables
   - Tables: `calendar_events`, `items`, `warehouses`, `warehouse_stock`, `stock_movements`, `warehouse_invoices`, `warehouse_invoice_lines`
   - Facility: full access
   - Workers: access assigned tasks only
   - Managers: read department data

5. **`migration_rls_phase4_reference_tables.sql`**
   - Implements RLS for reference data and system tables
   - Tables: `properties`, `companies`, `rooms`, `booking_counters`, `task_workflows`, `task_chat_messages`
   - Reference data: read-only for most, write for admin
   - System tables: RLS disabled (function-only access)

6. **`migration_rls_fix_helper_functions_security.sql`** (SECURITY FIX - REQUIRED)
   - Adds `SET search_path = public` to all helper functions
   - Prevents search_path injection attacks
   - Must run after all phases to fix security issue

7. **`migration_rls_fix_rpc_permission_check.sql`** (SECURITY FIX - REQUIRED)
   - Adds permission check to `mark_invoice_paid_and_confirm_booking` function
   - Only accounting department can execute
   - Replaces `migration_rls_fix_rpc_security.sql` (use this one instead)

## Testing After Migration

After running each phase, test with different user roles:

1. **Sales user**: Should access sales tables, read invoices/bookings
2. **Accounting user**: Should access invoices/bookings fully, read sales data
3. **Facility user**: Should access facility tables, read calendar events
4. **Worker**: Should access assigned tasks only
5. **Manager**: Should read department data
6. **Super manager**: Should read all data

## Rollback

If you need to rollback, you can restore permissive policies:

```sql
-- Example for one table (repeat for all tables)
DROP POLICY IF EXISTS "Sales full access to reservations" ON public.reservations;
CREATE POLICY "Allow all operations on reservations" ON public.reservations
  FOR ALL USING (true) WITH CHECK (true);
```

## Important Notes

1. **RPC Functions**: The `mark_invoice_paid_and_confirm_booking` function runs as `SECURITY DEFINER`, so it can bypass RLS to create bookings. This is intentional and correct.

2. **booking_counters**: RLS is disabled on this table because it's only accessed via the `generate_booking_no()` function, which runs as `SECURITY DEFINER`.

3. **Public Access**: The `requests` table allows anonymous users to create rows (for website forms). This is intentional.

4. **Profile Updates**: Users can update their own profiles, but cannot change `role` or `department` (admin-only).

## Verification Queries

After migration, verify policies are working:

```sql
-- Check which policies exist
SELECT schemaname, tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Check if RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```
