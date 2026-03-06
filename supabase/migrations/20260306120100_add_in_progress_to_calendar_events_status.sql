-- Extend calendar_events.status CHECK to include 'in_progress'.
-- Before running in production: run diagnostic queries from the plan to get actual
-- constraint name and definition; use that conname in DROP and same list + 'in_progress' in ADD.
-- Standard name is calendar_events_status_check.

ALTER TABLE public.calendar_events
  DROP CONSTRAINT IF EXISTS calendar_events_status_check;

ALTER TABLE public.calendar_events
  ADD CONSTRAINT calendar_events_status_check
  CHECK (status IN (
    'open',
    'assigned',
    'in_progress',
    'done_by_worker',
    'verified',
    'pending',
    'review',
    'archived',
    'completed'
  ));
