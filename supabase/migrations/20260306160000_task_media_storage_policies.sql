-- Storage policies for bucket task-media (task chat attachments).
-- Idempotent: safe to run multiple times.
-- Goal: allow authenticated users to upload and read objects in task-media.

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_media_insert ON storage.objects;
CREATE POLICY task_media_insert
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'task-media');

DROP POLICY IF EXISTS task_media_select ON storage.objects;
CREATE POLICY task_media_select
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'task-media');

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
