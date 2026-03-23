-- Phase 3B / Step 1: DB helper + RPC alignment (scope-first, no RLS policy churn yet).
--
-- CRITICAL TRANSITION RULE:
-- 1) If profiles.department_scope is present (non-null), treat it as the source of truth.
-- 2) Legacy fallback (department/category_access) is allowed ONLY when department_scope IS NULL.
--
-- Why strict? Pass 1 mirrors:
--   properties -> legacy department = sales
--   all        -> legacy department = facility
-- so unconditional OR on legacy department can mis-grant access.

-- Canonical resolver used by DB helper functions.
CREATE OR REPLACE FUNCTION public.effective_department_scope()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    CASE
      WHEN p.department_scope IN ('facility', 'accounting', 'sales', 'properties', 'all')
        THEN p.department_scope
      WHEN p.department_scope IS NULL AND p.department IN ('facility', 'accounting', 'sales')
        THEN p.department
      ELSE NULL
    END
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.has_full_scope_db()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role = 'super_manager'
        OR public.effective_department_scope() = 'all'
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.current_can_manage_users()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.can_manage_users IS TRUE
  );
$$;

-- LEGACY FALLBACK: sales category should only matter for unresolved profiles.
CREATE OR REPLACE FUNCTION public.has_sales_category_access()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.department_scope IS NULL
      AND p.category_access IS NOT NULL
      AND p.category_access @> '["sales"]'::jsonb
  );
$$;

-- Keep helper names stable for existing policies.
CREATE OR REPLACE FUNCTION public.is_sales_user()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role = 'super_manager'
        OR public.effective_department_scope() IN ('all', 'sales')
        OR (
          -- LEGACY FALLBACK (only when scope unresolved)
          p.department_scope IS NULL
          AND (
            p.department = 'sales'
            OR (
              p.category_access IS NOT NULL
              AND p.category_access @> '["sales"]'::jsonb
            )
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_accounting_user()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role = 'super_manager'
        OR public.effective_department_scope() IN ('all', 'accounting')
        OR (
          -- LEGACY FALLBACK (only when scope unresolved)
          p.department_scope IS NULL
          AND p.department = 'accounting'
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_facility_user()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role = 'super_manager'
        OR public.effective_department_scope() IN ('all', 'facility')
        OR (
          -- LEGACY FALLBACK (only when scope unresolved)
          p.department_scope IS NULL
          AND p.department = 'facility'
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_properties_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role = 'super_manager'
        OR public.effective_department_scope() = 'properties'
      )
  );
$$;

-- Phase 3B explicitly keeps is_manager() semantics unchanged.

GRANT EXECUTE ON FUNCTION public.effective_department_scope() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_full_scope_db() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_can_manage_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_sales_category_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_sales_user() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_accounting_user() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_facility_user() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_properties_admin() TO authenticated, anon;

-- RPC gate aligned to scope-first helper logic.
CREATE OR REPLACE FUNCTION public.mark_invoice_paid_and_confirm_booking(
  p_invoice_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice RECORD;
  v_offer RECORD;
  v_reservation RECORD;
  v_booking_id UUID;
  v_property_id UUID;
  v_start_date DATE;
  v_end_date DATE;
  v_guest TEXT;
  v_company_id UUID;
BEGIN
  IF NOT (
    (auth.jwt() ->> 'role') = 'service_role'
    OR public.is_accounting_user()
    OR public.is_sales_user()
  ) THEN
    RAISE EXCEPTION 'Access denied: accounting/sales scope (or service role) is required to mark invoices as paid';
  END IF;

  SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found: %', p_invoice_id; END IF;
  IF v_invoice.status = 'Paid' THEN RAISE EXCEPTION 'Invoice is already paid'; END IF;
  IF v_invoice.offer_id IS NULL THEN RAISE EXCEPTION 'Invoice must have offer_id to confirm booking'; END IF;

  SELECT * INTO v_offer FROM public.offers WHERE id = v_invoice.offer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Offer not found: %', v_invoice.offer_id; END IF;
  IF v_offer.reservation_id IS NULL THEN RAISE EXCEPTION 'Offer must have reservation_id to confirm booking'; END IF;

  SELECT * INTO v_reservation FROM public.reservations WHERE id = v_offer.reservation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reservation not found: %', v_offer.reservation_id; END IF;

  v_property_id := v_reservation.property_id;
  v_start_date := v_reservation.start_date;
  v_end_date := v_reservation.end_date;

  v_guest := COALESCE(
    NULLIF(TRIM(COALESCE(v_reservation.client_first_name, '') || ' ' || COALESCE(v_reservation.client_last_name, '')), ''),
    v_reservation.lead_label,
    'Guest'
  );

  SELECT id INTO v_company_id FROM public.companies ORDER BY created_at ASC LIMIT 1;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'No company found for booking creation. Create a company in public.companies first.';
  END IF;

  UPDATE public.invoices SET status = 'Paid', updated_at = NOW() WHERE id = p_invoice_id;

  INSERT INTO public.bookings (
    company_id,
    property_id, room_id, start_date, end_date, guest,
    check_in_time, check_out_time, status, price, balance, guests, unit, comments,
    payment_account, company, rate_plan, guarantee, cancellation_policy, no_show_policy, channel, type,
    address, phone, email, first_name, last_name, company_name, internal_company, client_type,
    price_per_night, tax_rate, total_gross, guest_list,
    source_invoice_id, source_offer_id, source_reservation_id, created_at, updated_at
  ) VALUES (
    v_company_id,
    v_reservation.property_id,
    v_reservation.property_id::TEXT,
    v_reservation.start_date,
    v_reservation.end_date,
    v_guest,
    '15:00',
    '11:00',
    'invoiced',
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
    v_offer.client_name,
    v_offer.internal_company,
    'Private',
    v_reservation.price_per_night_net,
    v_reservation.tax_rate,
    v_reservation.total_gross::TEXT,
    '[]'::jsonb,
    p_invoice_id,
    v_offer.id,
    v_reservation.id,
    NOW(),
    NOW()
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

  UPDATE public.offers
  SET status = 'Lost', updated_at = NOW()
  WHERE reservation_id IN (
    SELECT id FROM public.reservations
    WHERE property_id = v_property_id
      AND start_date <= v_end_date
      AND end_date >= v_start_date
      AND status = 'lost'
  )
  AND id != v_offer.id;

  RETURN v_booking_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_invoice_paid_and_confirm_booking(UUID) TO authenticated;
