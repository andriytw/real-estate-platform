-- Migration: Update is_booking_overlap to use half-open intervals [start_date, end_date)
-- and guard against invalid date ranges.
-- Assumption: bookings.end_date stores checkout date (exclusive).

CREATE OR REPLACE FUNCTION public.is_booking_overlap(
  p_property_id UUID,
  p_start_date DATE,
  p_end_date DATE
) RETURNS BOOLEAN AS $$
DECLARE
  overlap_count INTEGER;
BEGIN
  -- Guard against invalid or zero-length ranges: start_date must be strictly before end_date.
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'Invalid date range: start_date and end_date must be non-null';
  END IF;

  IF p_start_date >= p_end_date THEN
    RAISE EXCEPTION 'Invalid date range: start_date (%) must be before end_date (%)', p_start_date, p_end_date;
  END IF;

  -- Check if any booking overlaps with the given date range.
  -- Half-open interval logic: [start_date, end_date)
  -- A conflict exists only if:
  --   existing.start_date < p_end_date
  --   AND existing.end_date > p_start_date
  --
  -- Example (no conflict):
  --   existing: [2026-03-05, 2026-03-10)
  --   new:      [2026-03-10, 2026-03-15)
  --   existing.end_date > p_start_date -> 10 > 10 = false
  SELECT COUNT(*)
  INTO overlap_count
  FROM public.bookings
  WHERE property_id = p_property_id
    AND start_date < p_end_date
    AND end_date > p_start_date;

  RETURN overlap_count > 0;
END;
$$ LANGUAGE plpgsql STABLE;

-- Ensure execute permissions remain in place for clients using the RPC.
GRANT EXECUTE ON FUNCTION public.is_booking_overlap(UUID, DATE, DATE) TO authenticated, anon;

