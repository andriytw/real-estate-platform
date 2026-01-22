-- Migration: Ensure profiles table has proper RLS (critical for all other policies)
-- Profiles table is used in all RLS policy checks, so it must be secure
-- Users: read/update own profile
-- Managers: read department profiles
-- Super managers: read all profiles

-- Ensure RLS is enabled
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Managers can view all profiles in department" ON public.profiles;
DROP POLICY IF EXISTS "Managers can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Super managers can view all profiles" ON public.profiles;

-- Users: read own profile
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Users: update own profile (limited fields - role/department should be admin-only)
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    -- Prevent users from changing their own role/department
    AND (
      OLD.role = NEW.role
      AND OLD.department = NEW.department
    )
  );

-- Managers: read profiles in their department
CREATE POLICY "Managers can view department profiles" ON public.profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('manager', 'super_manager')
      AND (
        p.role = 'super_manager'
        OR p.department = profiles.department
      )
    )
  );

-- Note: Super managers are included in the above policy (they can see all)
-- If you want a separate policy for super managers only, you can add:
-- CREATE POLICY "Super managers can view all profiles" ON public.profiles
--   FOR SELECT
--   USING (
--     EXISTS (
--       SELECT 1 FROM public.profiles
--       WHERE id = auth.uid()
--       AND role = 'super_manager'
--     )
--   );
