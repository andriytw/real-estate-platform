-- Phase 3B / Step 2 (Approach B): task_chat_messages RLS (scope-first) + profiles UPDATE tightening only.
--
-- DOES NOT modify profiles SELECT policies (no DROP/CREATE SELECT on profiles).
-- Global assignee pool: workersService.getAll() uses profiles.select('*'); unchanged here.
--
-- BEFORE APPLYING (staging/prod): snapshot policies for audit / rollback:
--   SELECT policyname, cmd, qual, with_check
--   FROM pg_policies
--   WHERE schemaname = 'public' AND tablename IN ('profiles', 'task_chat_messages')
--   ORDER BY tablename, policyname;
--
-- Remove draft helper if present (not used in final Step 2).
DROP FUNCTION IF EXISTS public.coalesce_effective_scope(text, text);

-- ---------------------------------------------------------------------------
-- Task chat: scope-first (canViewModule tasks); no new category_access branches.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_access_task_chat_for_event(p_ce_department text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles c
    WHERE c.id = auth.uid()
      AND c.role IN ('manager', 'super_manager')
      AND (
        public.has_full_scope_db()
        OR (
          public.effective_department_scope() IN ('facility', 'accounting')
          AND (
            p_ce_department IS NULL
            OR p_ce_department = public.effective_department_scope()
          )
        )
        OR (
          c.department_scope IS NULL
          AND public.effective_department_scope() IS NULL
          AND (p_ce_department IS NULL OR p_ce_department = c.department)
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_access_task_chat_for_event(text) TO authenticated;

DROP POLICY IF EXISTS task_chat_messages_select_policy ON public.task_chat_messages;
DROP POLICY IF EXISTS task_chat_messages_insert_policy ON public.task_chat_messages;
DROP POLICY IF EXISTS "Users can view messages for their tasks" ON public.task_chat_messages;
DROP POLICY IF EXISTS "Users can send messages" ON public.task_chat_messages;
DROP POLICY IF EXISTS "Users access task messages" ON public.task_chat_messages;

CREATE POLICY task_chat_messages_select_policy
  ON public.task_chat_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.calendar_events ce
      WHERE ce.id = task_chat_messages.calendar_event_id
        AND (
          ce.worker_id = auth.uid()
          OR public.can_access_task_chat_for_event(ce.department)
        )
    )
  );

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
          OR public.can_access_task_chat_for_event(ce.department)
        )
    )
  );

-- ---------------------------------------------------------------------------
-- profiles: UPDATE only (Approach B — SELECT policies untouched).
-- Drop legacy privileged UPDATE policies; single replacement policy.
-- Existing "Users can update own profile" and all SELECT policies are NOT dropped here.
-- Self-escalation field locks: deferred to a follow-up trigger if needed (not in RLS here).
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS profiles_update_by_admin_capability_phase3b_v1 ON public.profiles;
DROP POLICY IF EXISTS "Super managers can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Managers can update profiles in department" ON public.profiles;
DROP POLICY IF EXISTS profiles_update_policy ON public.profiles;

CREATE POLICY profiles_update_by_admin_capability_phase3b_v1 ON public.profiles
  FOR UPDATE
  USING (
    auth.uid() <> id
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles c
        WHERE c.id = auth.uid() AND c.role = 'super_manager'
      )
      OR public.current_can_manage_users()
    )
  )
  WITH CHECK (
    auth.uid() <> id
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles c
        WHERE c.id = auth.uid() AND c.role = 'super_manager'
      )
      OR public.current_can_manage_users()
    )
  );
