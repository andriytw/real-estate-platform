-- Marketplace RLS fixes (production): no recursion, safe anon INSERT, remove unsafe "Allow all" policies.
-- Idempotent: safe to re-run.

-- =============================================================================
-- 1) SECURITY DEFINER helpers to avoid policy recursion on messages
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_marketplace_room(p_room_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_rooms cr
    WHERE cr.id = p_room_id
      AND cr.request_id IS NULL
      AND cr.client_id IS NULL
      AND cr.property_id IS NOT NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.is_first_message_in_room(p_room_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.chat_room_id = p_room_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_marketplace_room(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_marketplace_room(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_first_message_in_room(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_first_message_in_room(uuid) TO authenticated;

-- =============================================================================
-- 2) Remove unsafe "Allow all operations" policies (production blockers)
-- =============================================================================

DROP POLICY IF EXISTS "Allow all operations on chat_rooms" ON public.chat_rooms;
DROP POLICY IF EXISTS "Allow all operations on messages" ON public.messages;

-- =============================================================================
-- 3) messages: replace anon insert policy (no recursion – use helpers)
-- =============================================================================

DROP POLICY IF EXISTS "anon_insert_messages_first_only" ON public.messages;
CREATE POLICY "anon_insert_messages_first_only" ON public.messages
  FOR INSERT
  TO anon
  WITH CHECK (
    sender_type = 'client'
    AND public.is_marketplace_room(chat_room_id)
    AND public.is_first_message_in_room(chat_room_id)
  );

-- =============================================================================
-- 4) chat_rooms: anon insert for marketplace only (idempotent)
-- =============================================================================

DROP POLICY IF EXISTS "anon_insert_chat_rooms_marketplace" ON public.chat_rooms;
CREATE POLICY "anon_insert_chat_rooms_marketplace" ON public.chat_rooms
  FOR INSERT
  TO anon
  WITH CHECK (
    request_id IS NULL
    AND property_id IS NOT NULL
    AND client_id IS NULL
  );

-- =============================================================================
-- 5) requests: anon insert for marketplace (Send Request)
-- =============================================================================

DROP POLICY IF EXISTS "Public can create requests" ON public.requests;
DROP POLICY IF EXISTS "anon_insert_requests_marketplace" ON public.requests;
CREATE POLICY "anon_insert_requests_marketplace" ON public.requests
  FOR INSERT
  TO anon
  WITH CHECK (
    property_id IS NOT NULL
    AND coalesce(email, '') <> ''
    AND coalesce(phone, '') <> ''
  );

-- =============================================================================
-- 6) RPC: create marketplace request (guest Send Request) – no SELECT needed
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_marketplace_request(
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_people_count integer,
  p_start_date date,
  p_end_date date,
  p_message text,
  p_property_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.requests (
    first_name, last_name, email, phone, people_count,
    start_date, end_date, message, property_id, status
  )
  VALUES (
    p_first_name, p_last_name, p_email, p_phone, greatest(1, coalesce(p_people_count, 1)),
    p_start_date, p_end_date, nullif(trim(p_message), ''), p_property_id, 'pending'
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_marketplace_request(text, text, text, text, integer, date, date, text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.create_marketplace_request(text, text, text, text, integer, date, date, text, uuid) TO authenticated;

-- =============================================================================
-- 7) RPC: create marketplace guest chat (room + first message) – no SELECT needed
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_marketplace_guest_chat(
  p_property_id uuid,
  p_contact_line text,
  p_message_text text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_id uuid;
BEGIN
  INSERT INTO public.chat_rooms (property_id, request_id, client_id, status)
  VALUES (p_property_id, NULL, NULL, 'active')
  RETURNING id INTO v_room_id;

  INSERT INTO public.messages (chat_room_id, sender_type, text)
  VALUES (v_room_id, 'client', p_contact_line || E'\n\nMessage: ' || coalesce(p_message_text, '(no message)'));

  RETURN v_room_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_marketplace_guest_chat(uuid, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.create_marketplace_guest_chat(uuid, text, text) TO authenticated;
