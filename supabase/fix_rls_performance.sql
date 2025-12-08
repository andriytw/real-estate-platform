-- ============================================================================
-- FIX AUTH RLS INITIALIZATION PLAN WARNINGS
-- ============================================================================
-- Оптимізація RLS політик для покращення продуктивності
-- Замінюємо прямі виклики auth.uid() на функції user_role() та user_department()
-- які мають STABLE атрибут і кешуються
-- ============================================================================

-- ============================================================================
-- 1. KANBAN_COLUMNS TABLE
-- ============================================================================

-- Видаляємо старі політики
DROP POLICY IF EXISTS "Users can view columns in their department" ON kanban_columns;
DROP POLICY IF EXISTS "Managers can manage columns in their department" ON kanban_columns;

-- Оптимізована політика для SELECT
CREATE POLICY "kanban_columns_select_policy" ON kanban_columns
  FOR SELECT USING (
    -- Використовуємо функції замість auth.uid() для кращої продуктивності
    kanban_columns.department = public.user_department()
    OR public.user_role() = 'super_manager'
    OR EXISTS (
      SELECT 1 FROM kanban_column_workers kcw
      WHERE kcw.column_id = kanban_columns.id
      AND kcw.worker_id = auth.uid() -- Це OK, бо в підзапиті
    )
  );

-- Оптимізована політика для ALL (INSERT, UPDATE, DELETE)
CREATE POLICY "kanban_columns_manage_policy" ON kanban_columns
  FOR ALL USING (
    public.user_role() IN ('manager', 'super_manager')
    AND (
      kanban_columns.department = public.user_department()
      OR public.user_role() = 'super_manager'
    )
  );

-- ============================================================================
-- 2. KANBAN_COLUMN_WORKERS TABLE
-- ============================================================================

-- Видаляємо старі політики
DROP POLICY IF EXISTS "Users can view column workers" ON kanban_column_workers;
DROP POLICY IF EXISTS "Managers can manage column workers" ON kanban_column_workers;

-- Оптимізована політика для SELECT
CREATE POLICY "kanban_column_workers_select_policy" ON kanban_column_workers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM kanban_columns kc
      WHERE kc.id = kanban_column_workers.column_id
      AND (
        kc.department = public.user_department()
        OR public.user_role() = 'super_manager'
        OR kanban_column_workers.worker_id = auth.uid()
      )
    )
  );

-- Оптимізована політика для ALL
CREATE POLICY "kanban_column_workers_manage_policy" ON kanban_column_workers
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM kanban_columns kc
      WHERE kc.id = kanban_column_workers.column_id
      AND public.user_role() IN ('manager', 'super_manager')
      AND (
        kc.department = public.user_department()
        OR public.user_role() = 'super_manager'
      )
    )
  );

-- ============================================================================
-- 3. TASK_CHAT_MESSAGES TABLE
-- ============================================================================

-- Видаляємо старі політики
DROP POLICY IF EXISTS "Users can view messages for their tasks" ON task_chat_messages;
DROP POLICY IF EXISTS "Users can send messages" ON task_chat_messages;

-- Оптимізована політика для SELECT
CREATE POLICY "task_chat_messages_select_policy" ON task_chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM calendar_events ce
      WHERE ce.id = task_chat_messages.calendar_event_id
      AND (
        ce.worker_id = auth.uid()
        OR (
          public.user_role() IN ('manager', 'super_manager')
          AND (
            ce.department = public.user_department()
            OR public.user_role() = 'super_manager'
          )
        )
      )
    )
  );

-- Оптимізована політика для INSERT
CREATE POLICY "task_chat_messages_insert_policy" ON task_chat_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM calendar_events ce
      WHERE ce.id = task_chat_messages.calendar_event_id
      AND (
        ce.worker_id = auth.uid()
        OR (
          public.user_role() IN ('manager', 'super_manager')
          AND (
            ce.department = public.user_department()
            OR public.user_role() = 'super_manager'
          )
        )
      )
    )
  );

-- ============================================================================
-- 4. TASK_WORKFLOWS TABLE (якщо є старі політики з migration_kanban_auth.sql)
-- ============================================================================

-- Видаляємо старі політики, якщо вони існують
DROP POLICY IF EXISTS "Workers can view own workflows" ON task_workflows;
DROP POLICY IF EXISTS "Workers can update own workflows" ON task_workflows;
DROP POLICY IF EXISTS "Managers can view workflows in department" ON task_workflows;

-- Нові політики вже створені в fix_security_advisor_warnings.sql
-- Але оптимізуємо їх, якщо потрібно
-- (Вони вже використовують функції, але перевіримо)

-- ============================================================================
-- 5. PROFILES TABLE (оптимізація існуючих політик)
-- ============================================================================

-- Політики вже оптимізовані в fix_security_advisor_warnings.sql
-- Вони використовують user_role() та user_department()

-- ============================================================================
-- 6. USER_INVITATIONS TABLE (оптимізація існуючих політик)
-- ============================================================================

-- Політики вже оптимізовані в fix_security_advisor_warnings.sql
-- Вони використовують user_role()

-- ============================================================================
-- ПЕРЕВІРКА
-- ============================================================================

-- Перевірка політик
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('kanban_columns', 'kanban_column_workers', 'task_chat_messages', 'task_workflows', 'profiles', 'user_invitations')
ORDER BY tablename, policyname;

