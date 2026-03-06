-- Fix task_chat_messages RLS: table uses calendar_event_id, not workflow_id.
-- Phase4 policy "Users access task messages" references workflow_id and breaks INSERT.
-- Restore policies that use calendar_event_id so chat attachments can be saved.

-- Drop phase4 policy that uses non-existent workflow_id
DROP POLICY IF EXISTS "Users access task messages" ON public.task_chat_messages;

-- Drop legacy names so we can recreate cleanly
DROP POLICY IF EXISTS "Users can view messages for their tasks" ON public.task_chat_messages;
DROP POLICY IF EXISTS "Users can send messages" ON public.task_chat_messages;
DROP POLICY IF EXISTS "task_chat_messages_select_policy" ON public.task_chat_messages;
DROP POLICY IF EXISTS "task_chat_messages_insert_policy" ON public.task_chat_messages;

-- SELECT: user can see messages for tasks they can access (worker or manager/super_manager)
CREATE POLICY "Users can view messages for their tasks"
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

-- INSERT: user can send message if they are the sender and can access the task
CREATE POLICY "Users can send messages"
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
