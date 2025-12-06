-- Smart Chat Workflow - Additional Tables
-- Run this in Supabase SQL Editor after running schema.sql

-- Update Leads table with additional fields
ALTER TABLE leads ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES properties(id) ON DELETE SET NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_contact_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS preferred_dates JSONB DEFAULT '[]'::jsonb;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS interaction_count INTEGER DEFAULT 1;

-- Update source column to support multiple sources
-- source can be: 'chat', 'form', 'request', 'reservation', 'manual'

-- Clients table (клієнти)
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  company_name TEXT,
  company_address TEXT,
  client_type TEXT CHECK (client_type IN ('Private', 'Company')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create unique constraint on email+phone combination
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_email_phone ON clients(email, phone);

-- Chat Rooms table (кімнати чату)
CREATE TABLE IF NOT EXISTS chat_rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID REFERENCES requests(id) ON DELETE CASCADE,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'closed')),
  last_message_at TIMESTAMP WITH TIME ZONE,
  unread_count_manager INTEGER DEFAULT 0,
  unread_count_client INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Messages table (повідомлення)
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chat_room_id UUID REFERENCES chat_rooms(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('client', 'manager', 'system')),
  sender_id TEXT, -- client_id або manager_id
  text TEXT NOT NULL,
  attachments JSONB DEFAULT '[]'::jsonb, -- [{type: 'image'|'file', url: string, name: string}]
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_chat_rooms_request_id ON chat_rooms(request_id);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_client_id ON chat_rooms(client_id);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_property_id ON chat_rooms(property_id);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_status ON chat_rooms(status);
CREATE INDEX IF NOT EXISTS idx_messages_chat_room_id ON messages(chat_room_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_sender_type ON messages(sender_type);
CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
CREATE INDEX IF NOT EXISTS idx_leads_client_id ON leads(client_id);
CREATE INDEX IF NOT EXISTS idx_leads_property_id ON leads(property_id);
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);

-- Enable Row Level Security (RLS)
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (allow all for now - you can restrict later)
DROP POLICY IF EXISTS "Allow all operations on clients" ON clients;
DROP POLICY IF EXISTS "Allow all operations on chat_rooms" ON chat_rooms;
DROP POLICY IF EXISTS "Allow all operations on messages" ON messages;

CREATE POLICY "Allow all operations on clients" ON clients FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on chat_rooms" ON chat_rooms FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on messages" ON messages FOR ALL USING (true) WITH CHECK (true);

-- Create triggers to auto-update updated_at
DROP TRIGGER IF EXISTS update_clients_updated_at ON clients;
DROP TRIGGER IF EXISTS update_chat_rooms_updated_at ON chat_rooms;

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_chat_rooms_updated_at BEFORE UPDATE ON chat_rooms FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update last_message_at in chat_rooms when new message is created
CREATE OR REPLACE FUNCTION update_chat_room_last_message()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE chat_rooms
    SET last_message_at = NEW.created_at,
        unread_count_manager = CASE 
            WHEN NEW.sender_type = 'client' THEN unread_count_manager + 1
            ELSE unread_count_manager
        END,
        unread_count_client = CASE 
            WHEN NEW.sender_type = 'manager' THEN unread_count_client + 1
            ELSE unread_count_client
        END
    WHERE id = NEW.chat_room_id;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to update chat_room when message is created
DROP TRIGGER IF EXISTS update_chat_room_on_message ON messages;
CREATE TRIGGER update_chat_room_on_message
    AFTER INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION update_chat_room_last_message();
