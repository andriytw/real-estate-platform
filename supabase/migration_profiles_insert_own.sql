-- Migration: Allow authenticated users to insert their own profile row (create-on-first-login)
-- Use when handle_new_user trigger did not run (e.g. user created before trigger, or invite path).
-- RLS: Users can read/update own profile already; add INSERT for id = auth.uid().

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT
  WITH CHECK (id = auth.uid());
