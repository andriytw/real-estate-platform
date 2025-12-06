-- Migration: Make request_id nullable in chat_rooms table
-- This allows chat rooms to exist without a request (e.g., direct client-manager chats)

ALTER TABLE chat_rooms 
ALTER COLUMN request_id DROP NOT NULL;

-- Add comment
COMMENT ON COLUMN chat_rooms.request_id IS 'Optional reference to request. Can be NULL for direct chats.';



