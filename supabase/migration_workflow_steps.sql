-- Migration: Add workflow_steps JSONB field to calendar_events table
-- This field stores step-by-step workflow data for Einzug/Auszug tasks

ALTER TABLE calendar_events 
ADD COLUMN IF NOT EXISTS workflow_steps JSONB DEFAULT '[]'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN calendar_events.workflow_steps IS 'Step-by-step workflow data for tasks (e.g., Einzug/Auszug). Each step contains photos, videos, comments, meter readings, and completion status.';

