-- Allow Properties department admins to manage OOO blocks via bookings.type = 'BLOCK'.
-- Single source of truth: OOO ranges are persisted as bookings rows with type 'BLOCK'.

-- Ensure RLS is enabled (should already be on).
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- Properties admins: can INSERT/UPDATE/DELETE only BLOCK bookings.
DROP POLICY IF EXISTS "Properties admin insert BLOCK bookings" ON public.bookings;
CREATE POLICY "Properties admin insert BLOCK bookings" ON public.bookings
  FOR INSERT
  WITH CHECK (public.is_properties_admin() AND type = 'BLOCK');

DROP POLICY IF EXISTS "Properties admin update BLOCK bookings" ON public.bookings;
CREATE POLICY "Properties admin update BLOCK bookings" ON public.bookings
  FOR UPDATE
  USING (public.is_properties_admin() AND type = 'BLOCK')
  WITH CHECK (public.is_properties_admin() AND type = 'BLOCK');

DROP POLICY IF EXISTS "Properties admin delete BLOCK bookings" ON public.bookings;
CREATE POLICY "Properties admin delete BLOCK bookings" ON public.bookings
  FOR DELETE
  USING (public.is_properties_admin() AND type = 'BLOCK');

