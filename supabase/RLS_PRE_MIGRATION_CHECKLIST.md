# RLS Pre-Migration Checklist

## ✅ Files Created

1. **`RLS_AUDIT_REPORT.md`** - Complete audit with exact SQL from files
2. **`migration_rls_fix_helper_functions_security.sql`** - Fixes missing SET search_path
3. **`migration_rls_fix_rpc_permission_check.sql`** - Adds permission check to RPC function
4. **`RLS_VERIFICATION_QUERIES.sql`** - Post-migration verification queries

## ⚠️ Critical Issues Found (Must Fix Before Production)

### Issue 1: Helper Functions Missing SET search_path
**Status**: ❌ FIXED in `migration_rls_fix_helper_functions_security.sql`
**Impact**: Security risk (search_path injection)
**Action**: Run fix migration after all phases

### Issue 2: RPC Function Has No Permission Check
**Status**: ❌ FIXED in `migration_rls_fix_rpc_permission_check.sql`
**Impact**: Any authenticated user can execute (CRITICAL)
**Action**: Run fix migration (replaces `migration_rls_fix_rpc_security.sql`)

### Issue 3: No Company Isolation
**Status**: ⚠️ BY DESIGN (assumes single-company)
**Impact**: If multi-company needed, major schema changes required
**Action**: Decide if company isolation needed, then add `company_id` to all tables

## 📋 Updated Migration Order

1. `migration_rls_ensure_profiles_secure.sql`
2. `migration_rls_phase1_sales_tables.sql`
3. `migration_rls_phase2_financial_tables.sql`
4. `migration_rls_phase3_operational_tables.sql`
5. `migration_rls_phase4_reference_tables.sql`
6. **`migration_rls_fix_helper_functions_security.sql`** ← REQUIRED
7. **`migration_rls_fix_rpc_permission_check.sql`** ← REQUIRED

## ✅ Post-Migration Verification

Run `RLS_VERIFICATION_QUERIES.sql` after all migrations to verify:
- All tables have RLS enabled
- No permissive policies (USING(true))
- Helper functions have SET search_path
- RPC function has permission check

## 📄 See Also

- `RLS_AUDIT_REPORT.md` - Complete audit with exact SQL
- `migration_rls_readme.md` - Detailed migration guide
- `RLS_IMPLEMENTATION_SUMMARY.md` - Implementation summary
