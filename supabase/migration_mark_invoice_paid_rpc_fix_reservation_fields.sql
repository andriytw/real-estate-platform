-- Fix: reservations table has price_per_night_net (not price_per_night).
-- Fix: bookings.company_id is NOT NULL — use default company from public.companies.
-- Recreate mark_invoice_paid_and_confirm_booking with all required columns.
-- Run in Supabase SQL Editor.

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
  v_company_id UUID;
BEGIN
  SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found: %', p_invoice_id; END IF;
  IF v_invoice.status = 'Paid' THEN RAISE EXCEPTION 'Invoice is already paid'; END IF;

  IF v_invoice.offer_id IS NULL THEN
    RAISE EXCEPTION 'Invoice must have offer_id to confirm booking';
  END IF;
  SELECT * INTO v_offer FROM public.offers WHERE id = v_invoice.offer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Offer not found: %', v_invoice.offer_id; END IF;

  IF v_offer.reservation_id IS NULL THEN
    RAISE EXCEPTION 'Offer must have reservation_id to confirm booking';
  END IF;
  SELECT * INTO v_reservation FROM public.reservations WHERE id = v_offer.reservation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reservation not found: %', v_offer.reservation_id; END IF;

  SELECT id INTO v_company_id FROM public.companies ORDER BY created_at ASC LIMIT 1;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'No company found in public.companies. Create a company first.';
  END IF;

  v_property_id := v_reservation.property_id;
  v_start_date := v_reservation.start_date;
  v_end_date := v_reservation.end_date;

  UPDATE public.invoices SET status = 'Paid', updated_at = NOW() WHERE id = p_invoice_id;

  INSERT INTO public.bookings (
    company_id,
    property_id, room_id, start_date, end_date, guest,
    check_in_time, check_out_time, status, price, balance, guests, unit, comments,
    payment_account, company, rate_plan, guarantee, cancellation_policy, no_show_policy,
    channel, type, address, phone, email, first_name, last_name, company_name,
    internal_company, client_type, price_per_night, tax_rate, total_gross, guest_list,
    source_invoice_id, source_offer_id, source_reservation_id, created_at, updated_at
  ) VALUES (
    v_company_id,
    v_reservation.property_id,
    v_reservation.property_id::TEXT,
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
    '15:00', '11:00', 'invoiced',
    COALESCE(v_reservation.total_gross::TEXT, '0.00') || ' EUR',
    '0.00 EUR',
    COALESCE(v_reservation.guests_count::TEXT, '1') || ' Guests',
    'AUTO-UNIT',
    'Confirmed from invoice',
    'Pending', 'N/A', 'Standard', 'None', 'Standard', 'Standard', 'Direct', 'GUEST',
    v_reservation.client_address,
    v_reservation.client_phone,
    v_reservation.client_email,
    v_reservation.client_first_name,
    v_reservation.client_last_name,
    NULL,
    v_offer.internal_company,
    'Private',
    v_reservation.price_per_night_net,
    v_reservation.tax_rate,
    v_reservation.total_gross::TEXT,
    '[]'::jsonb,
    p_invoice_id, v_offer.id, v_reservation.id,
    NOW(), NOW()
  )
  RETURNING id INTO v_booking_id;

  UPDATE public.reservations SET status = 'won', updated_at = NOW() WHERE id = v_reservation.id;
  UPDATE public.offers SET status = 'Accepted', updated_at = NOW() WHERE id = v_offer.id;

  UPDATE public.reservations
  SET status = 'lost', updated_at = NOW()
  WHERE property_id = v_property_id
    AND id != v_reservation.id
    AND start_date <= v_end_date
    AND end_date >= v_start_date
    AND status IN ('open', 'offered', 'invoiced');

  UPDATE public.offers SET status = 'Lost', updated_at = NOW()
  WHERE reservation_id IN (
    SELECT id FROM public.reservations
    WHERE property_id = v_property_id
      AND start_date <= v_end_date
      AND end_date >= v_start_date
      AND status = 'lost'
  ) AND id != v_offer.id;

  RETURN v_booking_id;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.mark_invoice_paid_and_confirm_booking(UUID) TO authenticated, anon;
