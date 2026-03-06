-- Ensure task_chat_messages RLS policies use required names and allow INSERT/SELECT for workers and managers.
-- Table columns: id, calendar_event_id, sender_id, message_text, attachments, read_at, created_at. No workflow_id.
-- Idempotent: drops only relevant policies by name, then creates task_chat_messages_select_policy and task_chat_messages_insert_policy.

ALTER TABLE public.task_chat_messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies that may have been created with different names
DROP POLICY IF EXISTS "Users access task messages" ON public.task_chat_messages;
DROP POLICY IF EXISTS "Users can view messages for their tasks" ON public.task_chat_messages;
DROP POLICY IF EXISTS "Users can send messages" ON public.task_chat_messages;
DROP POLICY IF EXISTS task_chat_messages_select_policy ON public.task_chat_messages;
DROP POLICY IF EXISTS task_chat_messages_insert_policy ON public.task_chat_messages;

-- SELECT: users who have access to the related calendar_events row
CREATE POLICY task_chat_messages_select_policy
  ON public.task_chat_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.calendar_events ce
      WHERE ce.id = task_chat_messages.calendar_event_id
      AND (
        ce.worker_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
          AND p.role IN ('manager', 'super_manager')
          AND (ce.department IS NULL OR p.department = ce.department OR p.role = 'super_manager')
        )
      )
    )
  );

-- INSERT: sender_id = auth.uid() AND user has access to that calendar_event_id
CREATE POLICY task_chat_messages_insert_policy
  ON public.task_chat_messages
  FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.calendar_events ce
      WHERE ce.id = task_chat_messages.calendar_event_id
      AND (
        ce.worker_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
          AND p.role IN ('manager', 'super_manager')
          AND (ce.department IS NULL OR p.department = ce.department OR p.role = 'super_manager')
        )
      )
    )
  );

-- Verification (run after applying):
-- 1) Confirm storage policies exist:
--    SELECT policyname, cmd FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname ILIKE 'task_media_%';
-- 2) Confirm task_chat_messages policies exist:
--    SELECT policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename='task_chat_messages';
-- 3) Confirm no workflow_id references (expect 0 rows):
--    SELECT * FROM pg_policies WHERE schemaname='public' AND tablename='task_chat_messages'
--      AND (qual ILIKE '%workflow_id%' OR with_check ILIKE '%workflow_id%');
-- 4) Manual test:
--    - as worker: attach file + send -> succeeds
--    - as manager/super_manager: attach file + send -> succeeds
--    - open same task from both views -> attachment visible
