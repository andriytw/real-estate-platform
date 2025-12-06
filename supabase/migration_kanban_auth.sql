-- ============================================================================
-- Migration: Kanban Board with Authentication and Mobile Workflow
-- Run this in Supabase SQL Editor
-- ============================================================================

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. PROFILES TABLE (працівники, прив'язана до Supabase Auth)
-- ============================================================================

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  department TEXT CHECK (department IN ('facility', 'accounting', 'sales')),
  role TEXT NOT NULL CHECK (role IN ('worker', 'manager', 'super_manager')),
  manager_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  mobile_app_token TEXT,
  last_login_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for profiles
CREATE INDEX IF NOT EXISTS idx_profiles_department ON profiles(department);
CREATE INDEX IF NOT EXISTS idx_profiles_manager_id ON profiles(manager_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON profiles(is_active);

-- ============================================================================
-- 2. KANBAN COLUMNS TABLE (колонки дошки)
-- ============================================================================

CREATE TABLE IF NOT EXISTS kanban_columns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  department TEXT CHECK (department IN ('facility', 'accounting', 'sales')),
  is_backlog BOOLEAN DEFAULT false,
  color TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for kanban_columns
CREATE INDEX IF NOT EXISTS idx_kanban_columns_department ON kanban_columns(department);
CREATE INDEX IF NOT EXISTS idx_kanban_columns_order_index ON kanban_columns(order_index);
CREATE INDEX IF NOT EXISTS idx_kanban_columns_is_backlog ON kanban_columns(is_backlog);

-- ============================================================================
-- 3. KANBAN COLUMN WORKERS TABLE (many-to-many зв'язок)
-- ============================================================================

CREATE TABLE IF NOT EXISTS kanban_column_workers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  column_id UUID NOT NULL REFERENCES kanban_columns(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(column_id, worker_id)
);

-- Indexes for kanban_column_workers
CREATE INDEX IF NOT EXISTS idx_kanban_column_workers_column_id ON kanban_column_workers(column_id);
CREATE INDEX IF NOT EXISTS idx_kanban_column_workers_worker_id ON kanban_column_workers(worker_id);

-- ============================================================================
-- 4. UPDATE CALENDAR_EVENTS TABLE (додати нові поля)
-- ============================================================================

-- Add new columns to calendar_events if they don't exist
DO $$ 
BEGIN
  -- Add department column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'calendar_events' AND column_name = 'department'
  ) THEN
    ALTER TABLE calendar_events ADD COLUMN department TEXT CHECK (department IN ('facility', 'accounting', 'sales'));
  END IF;

  -- Add column_id column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'calendar_events' AND column_name = 'column_id'
  ) THEN
    ALTER TABLE calendar_events ADD COLUMN column_id UUID REFERENCES kanban_columns(id) ON DELETE SET NULL;
  END IF;

  -- Add worker_id column (using profiles.id instead of assigned_worker_id TEXT)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'calendar_events' AND column_name = 'worker_id'
  ) THEN
    ALTER TABLE calendar_events ADD COLUMN worker_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;

  -- Add created_from column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'calendar_events' AND column_name = 'created_from'
  ) THEN
    ALTER TABLE calendar_events ADD COLUMN created_from TEXT CHECK (created_from IN ('calendar', 'kanban'));
  END IF;
END $$;

-- Indexes for calendar_events new columns
CREATE INDEX IF NOT EXISTS idx_calendar_events_department ON calendar_events(department);
CREATE INDEX IF NOT EXISTS idx_calendar_events_column_id ON calendar_events(column_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_worker_id ON calendar_events(worker_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_created_from ON calendar_events(created_from);

-- ============================================================================
-- 5. TASK WORKFLOWS TABLE (для мобільного workflow)
-- ============================================================================

CREATE TABLE IF NOT EXISTS task_workflows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  calendar_event_id UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  step_1_completed BOOLEAN DEFAULT false,
  step_1_photos JSONB DEFAULT '[]'::jsonb,
  step_2_completed BOOLEAN DEFAULT false,
  step_2_photos JSONB DEFAULT '[]'::jsonb,
  step_3_completed BOOLEAN DEFAULT false,
  step_3_checklist JSONB DEFAULT '[]'::jsonb,
  step_4_completed BOOLEAN DEFAULT false,
  step_4_photos JSONB DEFAULT '[]'::jsonb,
  step_5_completed BOOLEAN DEFAULT false,
  time_start TIMESTAMP WITH TIME ZONE,
  time_end TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'verified')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(calendar_event_id)
);

-- Indexes for task_workflows
CREATE INDEX IF NOT EXISTS idx_task_workflows_calendar_event_id ON task_workflows(calendar_event_id);
CREATE INDEX IF NOT EXISTS idx_task_workflows_status ON task_workflows(status);

-- ============================================================================
-- 6. TASK CHAT MESSAGES TABLE (чат для завдань)
-- ============================================================================

CREATE TABLE IF NOT EXISTS task_chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  calendar_event_id UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message_text TEXT NOT NULL,
  attachments JSONB DEFAULT '[]'::jsonb,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for task_chat_messages
CREATE INDEX IF NOT EXISTS idx_task_chat_messages_calendar_event_id ON task_chat_messages(calendar_event_id);
CREATE INDEX IF NOT EXISTS idx_task_chat_messages_sender_id ON task_chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_task_chat_messages_created_at ON task_chat_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_task_chat_messages_read_at ON task_chat_messages(read_at);

-- ============================================================================
-- 7. TRIGGERS FOR UPDATED_AT
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_kanban_columns_updated_at ON kanban_columns;
CREATE TRIGGER update_kanban_columns_updated_at
  BEFORE UPDATE ON kanban_columns
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_task_workflows_updated_at ON task_workflows;
CREATE TRIGGER update_task_workflows_updated_at
  BEFORE UPDATE ON task_workflows
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 8. FUNCTION TO AUTO-CREATE PROFILE ON USER SIGNUP
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, role, is_active)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'worker'),
    true
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 9. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE kanban_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE kanban_column_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_chat_messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Managers can view all profiles in department" ON profiles;
DROP POLICY IF EXISTS "Super managers can view all profiles" ON profiles;

DROP POLICY IF EXISTS "Users can view columns in their department" ON kanban_columns;
DROP POLICY IF EXISTS "Managers can manage columns in their department" ON kanban_columns;
DROP POLICY IF EXISTS "Super managers can manage all columns" ON kanban_columns;

DROP POLICY IF EXISTS "Users can view column workers" ON kanban_column_workers;
DROP POLICY IF EXISTS "Managers can manage column workers" ON kanban_column_workers;

DROP POLICY IF EXISTS "Workers can view own workflows" ON task_workflows;
DROP POLICY IF EXISTS "Workers can update own workflows" ON task_workflows;
DROP POLICY IF EXISTS "Managers can view workflows in department" ON task_workflows;

DROP POLICY IF EXISTS "Users can view messages for their tasks" ON task_chat_messages;
DROP POLICY IF EXISTS "Users can send messages" ON task_chat_messages;

-- Profiles policies
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Managers can view all profiles in department" ON profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('manager', 'super_manager')
      AND p.department = profiles.department
    )
  );

CREATE POLICY "Super managers can view all profiles" ON profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'super_manager'
    )
  );

-- Kanban columns policies
CREATE POLICY "Users can view columns in their department" ON kanban_columns
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (
        p.department = kanban_columns.department
        OR p.role = 'super_manager'
        OR EXISTS (
          SELECT 1 FROM kanban_column_workers kcw
          WHERE kcw.column_id = kanban_columns.id
          AND kcw.worker_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Managers can manage columns in their department" ON kanban_columns
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('manager', 'super_manager')
      AND (
        p.department = kanban_columns.department
        OR p.role = 'super_manager'
      )
    )
  );

-- Kanban column workers policies
CREATE POLICY "Users can view column workers" ON kanban_column_workers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM kanban_columns kc
      WHERE kc.id = kanban_column_workers.column_id
      AND (
        EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = auth.uid()
          AND (
            p.department = kc.department
            OR p.role = 'super_manager'
            OR kanban_column_workers.worker_id = auth.uid()
          )
        )
      )
    )
  );

CREATE POLICY "Managers can manage column workers" ON kanban_column_workers
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM kanban_columns kc
      JOIN profiles p ON p.id = auth.uid()
      WHERE kc.id = kanban_column_workers.column_id
      AND p.role IN ('manager', 'super_manager')
      AND (
        p.department = kc.department
        OR p.role = 'super_manager'
      )
    )
  );

-- Task workflows policies
CREATE POLICY "Workers can view own workflows" ON task_workflows
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM calendar_events ce
      JOIN profiles p ON p.id = auth.uid()
      WHERE ce.id = task_workflows.calendar_event_id
      AND (
        ce.worker_id = auth.uid()
        OR p.role IN ('manager', 'super_manager')
      )
    )
  );

CREATE POLICY "Workers can update own workflows" ON task_workflows
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM calendar_events ce
      WHERE ce.id = task_workflows.calendar_event_id
      AND ce.worker_id = auth.uid()
    )
  );

CREATE POLICY "Managers can view workflows in department" ON task_workflows
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM calendar_events ce
      JOIN profiles p ON p.id = auth.uid()
      WHERE ce.id = task_workflows.calendar_event_id
      AND p.role IN ('manager', 'super_manager')
      AND (
        ce.department = p.department
        OR p.role = 'super_manager'
      )
    )
  );

-- Task chat messages policies
CREATE POLICY "Users can view messages for their tasks" ON task_chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM calendar_events ce
      WHERE ce.id = task_chat_messages.calendar_event_id
      AND (
        ce.worker_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = auth.uid()
          AND p.role IN ('manager', 'super_manager')
          AND (
            p.department = ce.department
            OR p.role = 'super_manager'
          )
        )
      )
    )
  );

CREATE POLICY "Users can send messages" ON task_chat_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM calendar_events ce
      WHERE ce.id = task_chat_messages.calendar_event_id
      AND (
        ce.worker_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = auth.uid()
          AND p.role IN ('manager', 'super_manager')
          AND (
            p.department = ce.department
            OR p.role = 'super_manager'
          )
        )
      )
    )
  );

-- ============================================================================
-- 10. INITIAL BACKLOG COLUMNS (створення Backlog колонок для кожного департаменту)
-- ============================================================================

-- Insert backlog columns for each department if they don't exist
DO $$
DECLARE
  dept TEXT;
BEGIN
  FOR dept IN SELECT unnest(ARRAY['facility', 'accounting', 'sales']) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM kanban_columns
      WHERE is_backlog = true AND department = dept
    ) THEN
      INSERT INTO kanban_columns (name, order_index, department, is_backlog, color)
      VALUES ('Backlog', 0, dept, true, '#6B7280');
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- Migration complete
-- ============================================================================
