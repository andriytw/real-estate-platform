-- Marketplace leads: auto upsert from requests and from guest contact-header messages.
-- Idempotent. No COUNT-based detection; message trigger uses header-format detection only.
-- All lead upsert + trigger functions are SECURITY DEFINER with SET search_path=public to bypass RLS under anon inserts.

-- 1) Ensure leads.property_id exists
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL;

-- 2) SECURITY DEFINER upsert: match by email OR normalized phone
CREATE OR REPLACE FUNCTION public.upsert_marketplace_lead(
  p_name text,
  p_email text,
  p_phone text,
  p_address text,
  p_property_id uuid,
  p_source text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_phone_norm text;
BEGIN
  v_phone_norm := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');

  SELECT id INTO v_id
  FROM public.leads
  WHERE (p_email IS NOT NULL AND trim(p_email) <> '' AND email = trim(p_email))
     OR (v_phone_norm <> '' AND regexp_replace(phone, '[^0-9]', '', 'g') = v_phone_norm)
  LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.leads(name, type, email, phone, address, status, source, property_id)
    VALUES (
      COALESCE(NULLIF(trim(p_name), ''), 'Client'),
      'Private',
      COALESCE(NULLIF(trim(p_email), ''), ''),
      COALESCE(NULLIF(trim(p_phone), ''), ''),
      COALESCE(NULLIF(trim(p_address), ''), 'Unknown property'),
      'Active',
      COALESCE(NULLIF(trim(p_source), ''), 'Marketplace'),
      p_property_id
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.leads
    SET
      name = COALESCE(NULLIF(trim(p_name), ''), name),
      email = COALESCE(NULLIF(trim(p_email), ''), email),
      phone = COALESCE(NULLIF(trim(p_phone), ''), phone),
      address = COALESCE(NULLIF(trim(p_address), ''), address),
      property_id = COALESCE(p_property_id, property_id),
      source = COALESCE(NULLIF(trim(p_source), ''), source),
      updated_at = NOW()
    WHERE id = v_id;
  END IF;

  RETURN v_id;
END;
$$;

-- 3) Trigger on requests (AFTER INSERT)
CREATE OR REPLACE FUNCTION public.trg_lead_from_request_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_addr text;
  v_title text;
  v_lead_address text;
  v_lead_name text;
BEGIN
  v_lead_name := trim(COALESCE(NEW.first_name, '') || ' ' || COALESCE(NEW.last_name, ''));
  IF NEW.property_id IS NULL THEN
    v_lead_address := 'Unknown property';
  ELSE
    SELECT address, title INTO v_addr, v_title
    FROM public.properties WHERE id = NEW.property_id;
    v_lead_address := trim(concat_ws(' — ', NULLIF(trim(COALESCE(v_addr, '')), ''), NULLIF(trim(COALESCE(v_title, '')), '')));
    IF v_lead_address = '' OR v_lead_address = ' — ' THEN
      v_lead_address := 'Unknown property';
    END IF;
  END IF;

  PERFORM public.upsert_marketplace_lead(
    v_lead_name,
    NEW.email,
    NEW.phone,
    v_lead_address,
    NEW.property_id,
    'Marketplace:request'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_from_request ON public.requests;
CREATE TRIGGER trg_lead_from_request
  AFTER INSERT ON public.requests
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_lead_from_request_fn();

-- 4) Trigger on messages: only marketplace guest contact-header message (strict guards, no COUNT)
CREATE OR REPLACE FUNCTION public.trg_lead_from_marketplace_message_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cr record;
  v_addr text;
  v_title text;
  v_lead_address text;
  v_name text;
  v_email text;
  v_phone text;
  v_t text;
  v_pos int;
BEGIN
  -- (a) Only client-sent messages
  IF NEW.sender_type IS DISTINCT FROM 'client' THEN
    RETURN NEW;
  END IF;

  -- (b) Room must be marketplace: client_id IS NULL, property_id IS NOT NULL, request_id IS NULL
  SELECT cr.property_id INTO v_cr
  FROM public.chat_rooms cr
  WHERE cr.id = NEW.chat_room_id
    AND cr.client_id IS NULL
    AND cr.property_id IS NOT NULL
    AND cr.request_id IS NULL;

  IF v_cr.property_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- (c) Message must look like contact header (Name:/Email:/Phone:/Message:)
  v_t := COALESCE(NEW.text, '');
  IF v_t NOT LIKE '%Name:%' OR v_t NOT LIKE '%Email:%' OR v_t NOT LIKE '%Phone:%' OR v_t NOT LIKE '%Message:%' THEN
    RETURN NEW;
  END IF;

  -- Parse name (after "Name:" up to | or newline)
  v_pos := position('Name:' in v_t);
  IF v_pos > 0 THEN
    v_t := substring(v_t from v_pos + 5);
    v_name := trim(split_part(split_part(v_t, '|', 1), E'\n', 1));
  ELSE
    v_name := 'Client';
  END IF;

  v_t := COALESCE(NEW.text, '');
  v_pos := position('Email:' in v_t);
  IF v_pos > 0 THEN
    v_t := substring(v_t from v_pos + 6);
    v_email := trim(split_part(split_part(v_t, '|', 1), E'\n', 1));
  ELSE
    v_email := '';
  END IF;

  v_t := COALESCE(NEW.text, '');
  v_pos := position('Phone:' in v_t);
  IF v_pos > 0 THEN
    v_t := substring(v_t from v_pos + 6);
    v_phone := trim(split_part(split_part(v_t, '|', 1), E'\n', 1));
  ELSE
    v_phone := '';
  END IF;

  -- Build property label
  SELECT address, title INTO v_addr, v_title
  FROM public.properties WHERE id = v_cr.property_id;
  v_lead_address := trim(concat_ws(' — ', NULLIF(trim(COALESCE(v_addr, '')), ''), NULLIF(trim(COALESCE(v_title, '')), '')));
  IF v_lead_address = '' OR v_lead_address = ' — ' THEN
    v_lead_address := 'Unknown property';
  END IF;

  PERFORM public.upsert_marketplace_lead(
    v_name,
    v_email,
    v_phone,
    v_lead_address,
    v_cr.property_id,
    'Marketplace:chat'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_from_marketplace_message ON public.messages;
CREATE TRIGGER trg_lead_from_marketplace_message
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_lead_from_marketplace_message_fn();
