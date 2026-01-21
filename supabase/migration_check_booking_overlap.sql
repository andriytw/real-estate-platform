-- Migration: Create function to check if date range overlaps with confirmed bookings
-- Used before creating new reservations to prevent conflicts

CREATE OR REPLACE FUNCTION public.is_booking_overlap(
  p_property_id UUID,
  p_start_date DATE,
  p_end_date DATE
) RETURNS BOOLEAN AS $$
DECLARE
  overlap_count INTEGER;
BEGIN
  -- Check if any confirmed booking overlaps with the given date range
  -- Overlap logic: (start1 <= end2) AND (end1 >= start2)
  SELECT COUNT(*)
  INTO overlap_count
  FROM public.bookings
  WHERE property_id = p_property_id
    AND start_date <= p_end_date
    AND end_date >= p_start_date;
  
  RETURN overlap_count > 0;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.is_booking_overlap(UUID, DATE, DATE) TO authenticated, anon;
