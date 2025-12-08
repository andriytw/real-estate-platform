-- Fix RLS policies to allow Super Admin to update other users' roles
-- Also fix sync_profile_email function to remove "Function Search Path Mutable" warning

-- 1. Fix sync_profile_email function
CREATE OR REPLACE FUNCTION sync_profile_email()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Sync email from auth.users if email is not set or different
  IF NEW.email IS NULL OR NEW.email != (SELECT email FROM auth.users WHERE id = NEW.id) THEN
    SELECT email INTO NEW.email FROM auth.users WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- 2. Check if Super Admin update policy exists, if not create it
DO $$
BEGIN
  -- Check if policy exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'profiles' 
    AND policyname = 'Super managers can update all profiles'
  ) THEN
    -- Create policy for Super Admin to update any profile
    CREATE POLICY "Super managers can update all profiles" ON public.profiles
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
          AND p.role = 'super_manager'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
          AND p.role = 'super_manager'
        )
      );
  END IF;
END $$;

-- 3. Also ensure Managers can update profiles in their department
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'profiles' 
    AND policyname = 'Managers can update profiles in department'
  ) THEN
    CREATE POLICY "Managers can update profiles in department" ON public.profiles
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
          AND p.role = 'manager'
          AND p.department = profiles.department
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
          AND p.role = 'manager'
          AND p.department = profiles.department
        )
      );
  END IF;
END $$;

-- Verification queries:
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'profiles' AND cmd = 'UPDATE';
-- SELECT proname, proconfig FROM pg_proc WHERE proname = 'sync_profile_email';

