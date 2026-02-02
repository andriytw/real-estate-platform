-- Migration: Allow authenticated users to insert their own profile row (create-on-first-login)
-- Use when handle_new_user trigger did not run (e.g. user created before trigger, or invite path).
-- Client inserts ONLY id, name, email; role/department/is_active come from DB defaults (safe).
-- DEFAULTs wrapped in IF EXISTS so migration succeeds across all existing DB schemas.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='role') THEN
    EXECUTE 'ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT ''worker''';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='department') THEN
    EXECUTE 'ALTER TABLE public.profiles ALTER COLUMN department SET DEFAULT ''facility''';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='is_active') THEN
    EXECUTE 'ALTER TABLE public.profiles ALTER COLUMN is_active SET DEFAULT true';
  END IF;
END $$;

-- RLS: allow user to insert own profile row only (id = auth.uid())
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT
  WITH CHECK (id = auth.uid());

-- Ensure users can read own profile (id = auth.uid())
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT
  USING (id = auth.uid());
