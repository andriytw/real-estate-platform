# RLS Implementation Summary

## Overview

This implementation provides production-ready Row Level Security (RLS) policies for the real estate platform, replacing the current permissive `USING (true)` policies with department and role-based access control.

## Files Created

1. **`migration_rls_ensure_profiles_secure.sql`** - Secures profiles table (MUST RUN FIRST)
2. **`migration_rls_phase1_sales_tables.sql`** - Sales department tables
3. **`migration_rls_phase2_financial_tables.sql`** - Financial tables (invoices, bookings)
4. **`migration_rls_phase3_operational_tables.sql`** - Facility/operational tables
5. **`migration_rls_phase4_reference_tables.sql`** - Reference data and system tables
6. **`migration_rls_fix_rpc_security.sql`** - Ensures RPC function has SECURITY DEFINER
7. **`migration_rls_readme.md`** - Detailed migration guide

## Execution Order

Execute in Supabase SQL Editor in this exact order:

```
1. migration_rls_ensure_profiles_secure.sql
2. migration_rls_phase1_sales_tables.sql
3. migration_rls_phase2_financial_tables.sql
4. migration_rls_phase3_operational_tables.sql
5. migration_rls_phase4_reference_tables.sql
6. migration_rls_fix_rpc_security.sql (optional, but recommended)
```

## Access Control Summary

### Sales Department
- **Full Access**: `reservations`, `offers`, `leads`, `requests`, `clients`, `chat_rooms`, `messages`
- **Read-Only**: `invoices`, `bookings`, `properties`, `companies`

### Accounting Department
- **Full Access**: `invoices`, `bookings`, `warehouse_invoices`, `warehouse_invoice_lines`
- **Read-Only**: All other tables (for reference)

### Facility Department
- **Full Access**: `calendar_events` (facility), `items`, `warehouses`, `warehouse_stock`, `stock_movements`, `warehouse_invoices`, `warehouse_invoice_lines`
- **Read-Only**: `properties`, `companies`, `bookings` (for calendar view)

### Workers
- **Read/Write**: Assigned `calendar_events` only
- **Read-Only**: All other accessible data

### Managers
- **Read**: All department data
- **Write**: Department-specific data (varies by department)

### Super Managers
- **Full Access**: All tables (admin override)

### All Authenticated Users
- **Read-Only**: `properties`, `companies`, `bookings` (for calendar), `calendar_events` (for calendar view)

## Key Security Features

1. **Department Isolation**: Users can only access data from their department
2. **Role-Based Access**: Workers, managers, and super managers have different permissions
3. **Financial Data Protection**: Only accounting can modify invoices and bookings
4. **Task Assignment**: Workers can only access assigned tasks
5. **RPC Function Security**: `mark_invoice_paid_and_confirm_booking` runs as SECURITY DEFINER to bypass RLS when creating confirmed bookings

## Testing Checklist

After implementation, test with each user role:

- [ ] Sales user can create/read/update reservations and offers
- [ ] Sales user can read invoices but cannot modify paid invoices
- [ ] Accounting user can modify invoices and bookings
- [ ] Facility user can manage warehouse and calendar events
- [ ] Worker can only access assigned tasks
- [ ] Manager can read department data
- [ ] Super manager can access all data
- [ ] RPC function can create bookings when invoice is marked as paid
- [ ] Anonymous users can create requests (website forms)

## Rollback

If issues occur, you can temporarily restore permissive policies:

```sql
-- Example for reservations table
DROP POLICY IF EXISTS "Sales full access to reservations" ON public.reservations;
DROP POLICY IF EXISTS "Managers read reservations" ON public.reservations;
CREATE POLICY "Allow all operations on reservations" ON public.reservations
  FOR ALL USING (true) WITH CHECK (true);
```

**Note**: Only use rollback for debugging. Restore proper policies before production.

## Important Notes

1. **Profiles Table**: Must be secured first - all other policies depend on it
2. **RPC Functions**: Run as SECURITY DEFINER to bypass RLS when needed
3. **booking_counters**: RLS disabled (system table, function-only access)
4. **Public Access**: `requests` table allows anonymous INSERT for website forms
5. **Profile Updates**: Users cannot change their own `role` or `department`

## Next Steps

1. Execute migrations in order
2. Test with different user roles
3. Monitor for any access issues
4. Adjust policies as needed based on business requirements
5. Document any custom policies added
