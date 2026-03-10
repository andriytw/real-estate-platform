-- ============================================================================
-- Multi-apartment offer-first flow: offer_headers + offer_items
-- Safe to run alongside legacy public.offers table.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.offer_counters (
    year INTEGER NOT NULL PRIMARY KEY,
    last_value INTEGER NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION public.generate_offer_no(
    p_created_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_year INTEGER;
    v_counter INTEGER;
BEGIN
    v_year := EXTRACT(YEAR FROM COALESCE(p_created_at, NOW()));
    INSERT INTO public.offer_counters (year, last_value)
    VALUES (v_year, 1)
    ON CONFLICT (year)
    DO UPDATE SET last_value = public.offer_counters.last_value + 1
    RETURNING last_value INTO v_counter;

    RETURN 'OFF-' || v_year || '-' || LPAD(v_counter::TEXT, 6, '0');
END;
$$;

CREATE TABLE IF NOT EXISTS public.offer_headers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    offer_no TEXT,
    status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Sent', 'Closed')),
    client_type TEXT NOT NULL CHECK (client_type IN ('Private', 'Company')),
    client_name TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    company_name TEXT,
    address TEXT,
    phone TEXT,
    email TEXT,
    internal_company TEXT NOT NULL,
    recipient_email TEXT,
    recipient_phone TEXT,
    client_message TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    nights INTEGER NOT NULL DEFAULT 1,
    lead_source TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_offer_headers_offer_no
ON public.offer_headers(offer_no)
WHERE offer_no IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_offer_header_offer_no()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.offer_no IS NULL OR NEW.offer_no = '' THEN
        NEW.offer_no := public.generate_offer_no(NEW.created_at);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_offer_header_offer_no ON public.offer_headers;
CREATE TRIGGER trg_set_offer_header_offer_no
    BEFORE INSERT ON public.offer_headers
    FOR EACH ROW
    EXECUTE FUNCTION public.set_offer_header_offer_no();

CREATE TABLE IF NOT EXISTS public.offer_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    offer_header_id UUID NOT NULL REFERENCES public.offer_headers(id) ON DELETE CASCADE,
    property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
    apartment_title TEXT,
    street TEXT NOT NULL,
    house_number TEXT,
    zip TEXT NOT NULL,
    city TEXT NOT NULL,
    apartment_code TEXT NOT NULL,
    apartment_group_name TEXT,
    marketplace_url TEXT,
    nightly_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    tax_rate NUMERIC(6,2) NOT NULL DEFAULT 19,
    nights INTEGER NOT NULL DEFAULT 1,
    net_total NUMERIC(12,2) NOT NULL DEFAULT 0,
    vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    gross_total NUMERIC(12,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Offered' CHECK (status IN ('Offered', 'Selected', 'Converted', 'Rejected', 'Expired')),
    selected_at TIMESTAMP WITH TIME ZONE,
    converted_at TIMESTAMP WITH TIME ZONE,
    reservation_id UUID REFERENCES public.reservations(id) ON DELETE SET NULL,
    legacy_offer_id UUID REFERENCES public.offers(id) ON DELETE SET NULL,
    invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offer_items_header_id ON public.offer_items(offer_header_id);
CREATE INDEX IF NOT EXISTS idx_offer_items_property_id ON public.offer_items(property_id);
CREATE INDEX IF NOT EXISTS idx_offer_items_status ON public.offer_items(status);
CREATE INDEX IF NOT EXISTS idx_offer_items_legacy_offer_id ON public.offer_items(legacy_offer_id);
CREATE INDEX IF NOT EXISTS idx_offer_items_reservation_id ON public.offer_items(reservation_id);
CREATE INDEX IF NOT EXISTS idx_offer_items_invoice_id ON public.offer_items(invoice_id);
