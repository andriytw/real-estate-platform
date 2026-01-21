-- Migration: Create RPC function to mark invoice as paid and confirm booking
-- This is the "winning flow" - atomic transaction that:
-- 1. Marks invoice as paid
-- 2. Creates confirmed booking
-- 3. Marks winning reservation/offer
-- 4. Marks losing overlapping reservations/offers as lost

CREATE OR REPLACE FUNCTION public.mark_invoice_paid_and_confirm_booking(
  p_invoice_id UUID
) RETURNS UUID AS $$
DECLARE
  v_invoice RECORD;
  v_offer RECORD;
  v_reservation RECORD;
  v_booking_id UUID;
  v_property_id UUID;
  v_start_date DATE;
  v_end_date DATE;
BEGIN
  -- Step 1: Validate invoice exists and is not already paid
  SELECT * INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found: %', p_invoice_id;
  END IF;
  
  IF v_invoice.status = 'Paid' THEN
    RAISE EXCEPTION 'Invoice is already paid';
  END IF;
  
  -- Step 2: Load linked offer (mandatory)
  IF v_invoice.offer_id IS NULL THEN
    RAISE EXCEPTION 'Invoice must have offer_id to confirm booking';
  END IF;
  
  SELECT * INTO v_offer
  FROM public.offers
  WHERE id = v_invoice.offer_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Offer not found: %', v_invoice.offer_id;
  END IF;
  
  -- Step 3: Load linked reservation
  IF v_offer.reservation_id IS NULL THEN
    RAISE EXCEPTION 'Offer must have reservation_id to confirm booking';
  END IF;
  
  SELECT * INTO v_reservation
  FROM public.reservations
  WHERE id = v_offer.reservation_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation not found: %', v_offer.reservation_id;
  END IF;
  
  -- Extract property and dates for overlap checking
  v_property_id := v_reservation.property_id;
  v_start_date := v_reservation.start_date;
  v_end_date := v_reservation.end_date;
  
  -- Step 4: Set invoice status to 'Paid'
  UPDATE public.invoices
  SET status = 'Paid',
      updated_at = NOW()
  WHERE id = p_invoice_id;
  
  -- Step 5: Create confirmed booking in bookings table
  INSERT INTO public.bookings (
    property_id,
    room_id, -- Use property_id as room_id (or extract from property if needed)
    start_date,
    end_date,
    guest, -- Use client name from reservation
    check_in_time,
    check_out_time,
    status,
    price,
    balance,
    guests,
    unit,
    comments,
    payment_account,
    company,
    rate_plan,
    guarantee,
    cancellation_policy,
    no_show_policy,
    channel,
    type,
    address,
    phone,
    email,
    first_name,
    last_name,
    company_name,
    internal_company,
    client_type,
    price_per_night,
    tax_rate,
    total_gross,
    guest_list,
    source_invoice_id,
    source_offer_id,
    source_reservation_id,
    created_at,
    updated_at
  ) VALUES (
    v_reservation.property_id,
    v_reservation.property_id::TEXT, -- room_id as property_id string
    v_reservation.start_date,
    v_reservation.end_date,
    COALESCE(
      CASE 
        WHEN v_reservation.client_first_name IS NOT NULL OR v_reservation.client_last_name IS NOT NULL 
        THEN TRIM(COALESCE(v_reservation.client_first_name, '') || ' ' || COALESCE(v_reservation.client_last_name, ''))
        ELSE v_reservation.lead_label
      END,
      'Guest'
    ),
    '15:00', -- Default check-in
    '11:00', -- Default check-out
    'invoiced', -- Status for confirmed booking
    COALESCE(v_reservation.total_gross::TEXT, '0.00') || ' EUR',
    '0.00 EUR',
    COALESCE(v_reservation.guests_count::TEXT, '1') || ' Guests',
    'AUTO-UNIT',
    'Confirmed from invoice',
    'Pending',
    'N/A',
    'Standard',
    'None',
    'Standard',
    'Standard',
    'Direct',
    'GUEST',
    v_reservation.client_address,
    v_reservation.client_phone,
    v_reservation.client_email,
    v_reservation.client_first_name,
    v_reservation.client_last_name,
    NULL, -- company_name
    v_offer.internal_company,
    'Private', -- Default client_type
    v_reservation.price_per_night,
    v_reservation.tax_rate,
    v_reservation.total_gross::TEXT,
    '[]'::jsonb, -- guest_list
    p_invoice_id,
    v_offer.id,
    v_reservation.id,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_booking_id;
  
  -- Step 6: Mark winning reservation status = 'won'
  UPDATE public.reservations
  SET status = 'won',
      updated_at = NOW()
  WHERE id = v_reservation.id;
  
  -- Step 7: Mark winning offer status = 'Accepted' (Paid Confirmed)
  UPDATE public.offers
  SET status = 'Accepted',
      updated_at = NOW()
  WHERE id = v_offer.id;
  
  -- Step 8: Find all overlapping reservations and mark as 'lost'
  -- Overlapping: same property, overlapping dates, status in ('open','offered','invoiced')
  UPDATE public.reservations
  SET status = 'lost',
      updated_at = NOW()
  WHERE property_id = v_property_id
    AND id != v_reservation.id -- Exclude winning reservation
    AND start_date <= v_end_date
    AND end_date >= v_start_date
    AND status IN ('open', 'offered', 'invoiced');
  
  -- Step 9: Mark all offers linked to lost reservations as 'lost'
  UPDATE public.offers
  SET status = 'Lost',
      updated_at = NOW()
  WHERE reservation_id IN (
    SELECT id
    FROM public.reservations
    WHERE property_id = v_property_id
      AND start_date <= v_end_date
      AND end_date >= v_start_date
      AND status = 'lost'
  )
  AND id != v_offer.id; -- Exclude winning offer
  
  -- Return created booking_id
  RETURN v_booking_id;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.mark_invoice_paid_and_confirm_booking(UUID) TO authenticated, anon;
