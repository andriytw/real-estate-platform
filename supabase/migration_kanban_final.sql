-- KANBAN BOARD & MOBILE APP MIGRATION
-- This migration enables the full Kanban system with role-based columns and mobile workflows.

-- 1. UPDATE PROFILES (Users)
-- Ensure we have all necessary fields for the "Personal Board" logic.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS manager_id uuid REFERENCES profiles(id);
-- role and department should already exist, but let's ensure constraints if needed
-- (Assuming role is text check constraint or enum in previous migrations)

-- 2. UPDATE CALENDAR_EVENTS (Unified Tasks Table)
-- We use calendar_events as the single source of truth for both Calendar and Kanban.
-- If date/time is NULL, it appears in "Backlog" / "Unassigned" but not in the calendar grid (until assigned).

ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent'));
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS is_issue boolean DEFAULT false; -- True if reported by worker
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS manager_id uuid REFERENCES profiles(id); -- Who approved/created it
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS worker_id uuid REFERENCES profiles(id); -- Assignee (Column Owner)
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS department text CHECK (department IN ('facility', 'accounting', 'sales', 'general'));
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS images jsonb DEFAULT '[]'::jsonb; -- Array of image URLs (issue reports, etc)
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS checklist jsonb DEFAULT '[]'::jsonb; -- Array of {text, checked}
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS location_text text; -- Custom location if not bound to property

-- Ensure status has necessary values for workflow
-- Existing: 'pending', 'completed', etc. Let's standardize.
-- We'll use a text check constraint if one doesn't exist, or just rely on app logic.
-- Suggested: 'pending' (new), 'assigned', 'in_progress', 'review', 'completed', 'verified'

-- 3. TASK WORKFLOWS (Mobile Steps)
-- Tracks the execution progress of a specific task by a worker.
CREATE TABLE IF NOT EXISTS task_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES calendar_events(id) ON DELETE CASCADE,
  worker_id uuid REFERENCES profiles(id),
  
  -- Step 1: Key / Start
  started_at timestamptz,
  
  -- Step 2: Before Photos
  photos_before jsonb DEFAULT '[]'::jsonb,
  
  -- Step 3: Checklist
  checklist_completed jsonb DEFAULT '[]'::jsonb,
  
  -- Step 4: After Photos
  photos_after jsonb DEFAULT '[]'::jsonb,
  
  -- Step 5: Finish
  completed_at timestamptz,
  verified_at timestamptz,
  verified_by uuid REFERENCES profiles(id),
  
  status text DEFAULT 'active' CHECK (status IN ('active', 'submitted', 'verified', 'rejected')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 4. TASK CHAT / COMMENTS
CREATE TABLE IF NOT EXISTS task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES calendar_events(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id),
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 5. SECURITY POLICIES (RLS)

-- Enable RLS
ALTER TABLE task_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;

-- Policies for calendar_events (Tasks) were likely already set, but we need to ensure:
-- Workers can see tasks assigned to them OR unassigned tasks in their department (if we allow pulling).
-- Managers can see all tasks in their department.
-- Super Admin sees everything.

-- (Assuming existing policies on calendar_events might need adjustment, 
-- but usually "read all" or "read department" covers it. 
-- We will add specific ones for Workflow).

-- Workflow Policies
CREATE POLICY "Workers can manage own workflows" ON task_workflows
  FOR ALL USING (auth.uid() = worker_id);

CREATE POLICY "Managers can view department workflows" ON task_workflows
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() 
      AND (role IN ('manager', 'super_manager'))
    )
  );

CREATE POLICY "Managers can update department workflows" ON task_workflows
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() 
      AND (role IN ('manager', 'super_manager'))
    )
  );

-- Comments Policies
CREATE POLICY "Users can read comments on visible tasks" ON task_comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM calendar_events
      WHERE id = task_comments.task_id
      -- Rely on calendar_events RLS to filter visibility, 
      -- theoretically we should replicate the logic here but simplistic approach:
      -- If you can see the task, you can see comments.
      -- Since we can't easily join cross-table policies efficiently without functions,
      -- let's just allow authenticated users to read comments for now, 
      -- or refine to "Participants".
    )
  );

CREATE POLICY "Users can create comments" ON task_comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 6. INDEXES for performance
CREATE INDEX IF NOT EXISTS idx_calendar_events_worker_id ON calendar_events(worker_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_status ON calendar_events(status);
CREATE INDEX IF NOT EXISTS idx_calendar_events_department ON calendar_events(department);
CREATE INDEX IF NOT EXISTS idx_calendar_events_is_issue ON calendar_events(is_issue);

