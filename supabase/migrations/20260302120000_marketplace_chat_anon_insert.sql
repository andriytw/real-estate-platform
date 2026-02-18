-- Marketplace guest chat: allow anon INSERT only for marketplace rooms and first message (anti-spam).
-- No schema changes; policies only.

-- chat_rooms: anon can create only marketplace rooms (no request_id, no client_id, property_id required)
DROP POLICY IF EXISTS "anon_insert_chat_rooms_marketplace" ON public.chat_rooms;
CREATE POLICY "anon_insert_chat_rooms_marketplace" ON public.chat_rooms
  FOR INSERT
  TO anon
  WITH CHECK (
    request_id IS NULL
    AND property_id IS NOT NULL
    AND client_id IS NULL
  );

-- messages: anon can insert only the first message in a marketplace room (sender_type = client, room exists and is marketplace, no other messages yet)
DROP POLICY IF EXISTS "anon_insert_messages_first_only" ON public.messages;
CREATE POLICY "anon_insert_messages_first_only" ON public.messages
  FOR INSERT
  TO anon
  WITH CHECK (
    sender_type = 'client'
    AND EXISTS (
      SELECT 1 FROM public.chat_rooms cr
      WHERE cr.id = chat_room_id AND cr.request_id IS NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.messages m2
      WHERE m2.chat_room_id = messages.chat_room_id
    )
  );
