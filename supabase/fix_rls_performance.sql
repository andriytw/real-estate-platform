-- ============================================================================
-- FIX SUPABASE SECURITY ADVISOR WARNINGS (ВИПРАВЛЕНА ВЕРСІЯ)
-- ============================================================================
-- Цей скрипт виправляє всі попередження Security Advisor:
-- 1. Function Search Path Mutable (6 warnings)
-- 2. Multiple Permissive Policies (38 warnings)
-- 3. Leaked Password Protection (1 warning - потрібно увімкнути вручну)
-- ============================================================================

-- ============================================================================
-- 1. FIX FUNCTION SEARCH PATH MUTABLE
-- ============================================================================

-- Helper function to get current user ID using current_setting (кешується автоматично)
-- Використовуємо current_setting замість auth.uid() для кращої продуктивності
CREATE OR REPLACE FUNCTION public.auth_uid_cached()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(
    current_setting('request.jwt.claim.sub', true)::uuid,
    auth.uid() -- Fallback to auth.uid() if current_setting fails
  );
$$;

-- Fix user_role() - використовуємо кешовану функцію
CREATE OR REPLACE FUNCTION public.user_role()
RETURNS TEXT 
LANGUAGE sql 
SECURITY DEFINER 
STABLE
SET search_path = ''
AS $$
  SELECT role FROM public.profiles WHERE id = public.auth_uid_cached();
$$;

-- Fix user_department() - використовуємо кешовану функцію
CREATE OR REPLACE FUNCTION public.user_department()
RETURNS TEXT 
LANGUAGE sql 
SECURITY DEFINER 
STABLE
SET search_path = ''
AS $$
  SELECT department FROM public.profiles WHERE id = public.auth_uid_cached();
$$;

-- Fix handle_new_user()
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = ''
AS $$
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
$$;

-- Fix update_updated_at_column()
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Fix update_chat_room_last_message()
CREATE OR REPLACE FUNCTION public.update_chat_room_last_message()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    UPDATE public.chat_rooms
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
$$;

-- ============================================================================
-- 2. FIX MULTIPLE PERMISSIVE POLICIES
-- ============================================================================

-- ============================================================================
-- 2.1. PROFILES TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Managers can view all profiles in department" ON profiles;
DROP POLICY IF EXISTS "Super managers can view all profiles" ON profiles;
DROP POLICY IF EXISTS "profiles_select_policy" ON profiles;
DROP POLICY IF EXISTS "profiles_update_policy" ON profiles;

-- Об'єднана політика для SELECT (використовуємо кешовану функцію)
CREATE POLICY "profiles_select_policy" ON profiles
  FOR SELECT USING (
    public.auth_uid_cached() = id
    OR
    (
      public.user_role() IN ('manager', 'super_manager')
      AND department = public.user_department()
    )
    OR
    (public.user_role() = 'super_manager')
  );

-- Політика для UPDATE (використовуємо кешовану функцію)
CREATE POLICY "profiles_update_policy" ON profiles
  FOR UPDATE USING (public.auth_uid_cached() = id);

-- ============================================================================
-- 2.2. TASK_WORKFLOWS TABLE (з перевіркою існування)
-- ============================================================================

DO $$
DECLARE
  pol RECORD;
BEGIN
  -- Перевіряємо, чи існує таблиця
  IF EXISTS (
    SELECT 1 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'task_workflows'
  ) THEN
    -- Видаляємо ВСІ старі політики динамічно (включаючи небезпечні)
    FOR pol IN 
      SELECT policyname 
      FROM pg_policies 
      WHERE schemaname = 'public' 
      AND tablename = 'task_workflows'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON task_workflows', pol.policyname);
    END LOOP;
    
    -- Перевіряємо, чи існує колонка worker_id
    IF EXISTS (
      SELECT 1 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'task_workflows' 
      AND column_name = 'worker_id'
    ) THEN
      -- Створюємо нові об'єднані політики (якщо є worker_id) - використовуємо кешовану функцію
      CREATE POLICY "task_workflows_select_policy" ON task_workflows
        FOR SELECT USING (
          public.auth_uid_cached() = worker_id
          OR
          public.user_role() IN ('manager', 'super_manager')
        );
      
      CREATE POLICY "task_workflows_update_policy" ON task_workflows
        FOR UPDATE USING (
          public.auth_uid_cached() = worker_id
          OR
          public.user_role() IN ('manager', 'super_manager')
        );
      
      CREATE POLICY "task_workflows_insert_policy" ON task_workflows
        FOR INSERT WITH CHECK (public.auth_uid_cached() = worker_id);
    ELSE
      -- Якщо немає worker_id, створюємо політики без прив'язки до worker_id
      -- (тільки для менеджерів) - використовуємо функції замість EXISTS
      CREATE POLICY "task_workflows_select_policy" ON task_workflows
        FOR SELECT USING (
          public.user_role() IN ('manager', 'super_manager')
        );
      
      CREATE POLICY "task_workflows_update_policy" ON task_workflows
        FOR UPDATE USING (
          public.user_role() IN ('manager', 'super_manager')
        );
      
      CREATE POLICY "task_workflows_insert_policy" ON task_workflows
        FOR INSERT WITH CHECK (
          public.user_role() IN ('manager', 'super_manager')
        );
    END IF;
  ELSE
    RAISE NOTICE 'Table task_workflows does not exist. Skipping policies.';
  END IF;
END $$;

-- ============================================================================
-- 2.3. USER_INVITATIONS TABLE (якщо існує)
-- ============================================================================

DO $$
DECLARE
  pol RECORD;
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'user_invitations'
  ) THEN
    -- Видаляємо всі старі політики (спробуємо всі можливі назви)
    DROP POLICY IF EXISTS "user_invitations_select_policy" ON user_invitations;
    DROP POLICY IF EXISTS "user_invitations_insert_policy" ON user_invitations;
    DROP POLICY IF EXISTS "user_invitations_update_policy" ON user_invitations;
    
    -- Видаляємо всі інші можливі політики через динамічний SQL
    FOR pol IN 
      SELECT policyname 
      FROM pg_policies 
      WHERE schemaname = 'public' 
      AND tablename = 'user_invitations'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON user_invitations', pol.policyname);
    END LOOP;
    
    -- Створюємо об'єднані політики - використовуємо функції замість EXISTS
    CREATE POLICY "user_invitations_select_policy" ON user_invitations
      FOR SELECT USING (
        public.user_role() IN ('manager', 'super_manager')
      );
    
    CREATE POLICY "user_invitations_insert_policy" ON user_invitations
      FOR INSERT WITH CHECK (
        public.user_role() IN ('manager', 'super_manager')
      );
    
    CREATE POLICY "user_invitations_update_policy" ON user_invitations
      FOR UPDATE USING (
        public.user_role() IN ('manager', 'super_manager')
      );
  END IF;
END $$;

-- ============================================================================
-- 2.4. KANBAN_COLUMNS TABLE (оптимізація для Auth RLS Initialization Plan)
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'kanban_columns'
  ) THEN
    -- Видаляємо старі політики
    DROP POLICY IF EXISTS "Users can view columns in their department" ON kanban_columns;
    DROP POLICY IF EXISTS "Managers can manage columns in their department" ON kanban_columns;
    DROP POLICY IF EXISTS "kanban_columns_select_policy" ON kanban_columns;
    DROP POLICY IF EXISTS "kanban_columns_manage_policy" ON kanban_columns;
    DROP POLICY IF EXISTS "kanban_columns_insert_policy" ON kanban_columns;
    DROP POLICY IF EXISTS "kanban_columns_update_policy" ON kanban_columns;
    DROP POLICY IF EXISTS "kanban_columns_delete_policy" ON kanban_columns;
    
    -- Об'єднана політика для SELECT (використовує функції замість auth.uid())
    CREATE POLICY "kanban_columns_select_policy" ON kanban_columns
      FOR SELECT USING (
        kanban_columns.department = public.user_department()
        OR public.user_role() = 'super_manager'
        OR EXISTS (
          SELECT 1 FROM kanban_column_workers kcw
          WHERE kcw.column_id = kanban_columns.id
          AND kcw.worker_id = public.auth_uid_cached()
        )
      );
    
    -- Окремі політики для INSERT, UPDATE, DELETE (не ALL, щоб уникнути конфлікту)
    CREATE POLICY "kanban_columns_insert_policy" ON kanban_columns
      FOR INSERT WITH CHECK (
        public.user_role() IN ('manager', 'super_manager')
        AND (
          kanban_columns.department = public.user_department()
          OR public.user_role() = 'super_manager'
        )
      );
    
    CREATE POLICY "kanban_columns_update_policy" ON kanban_columns
      FOR UPDATE USING (
        public.user_role() IN ('manager', 'super_manager')
        AND (
          kanban_columns.department = public.user_department()
          OR public.user_role() = 'super_manager'
        )
      );
    
    CREATE POLICY "kanban_columns_delete_policy" ON kanban_columns
      FOR DELETE USING (
        public.user_role() IN ('manager', 'super_manager')
        AND (
          kanban_columns.department = public.user_department()
          OR public.user_role() = 'super_manager'
        )
      );
  END IF;
END $$;

-- ============================================================================
-- 2.5. KANBAN_COLUMN_WORKERS TABLE (оптимізація для Auth RLS Initialization Plan)
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'kanban_column_workers'
  ) THEN
    -- Видаляємо старі політики
    DROP POLICY IF EXISTS "Users can view column workers" ON kanban_column_workers;
    DROP POLICY IF EXISTS "Managers can manage column workers" ON kanban_column_workers;
    DROP POLICY IF EXISTS "kanban_column_workers_select_policy" ON kanban_column_workers;
    DROP POLICY IF EXISTS "kanban_column_workers_manage_policy" ON kanban_column_workers;
    DROP POLICY IF EXISTS "kanban_column_workers_insert_policy" ON kanban_column_workers;
    DROP POLICY IF EXISTS "kanban_column_workers_update_policy" ON kanban_column_workers;
    DROP POLICY IF EXISTS "kanban_column_workers_delete_policy" ON kanban_column_workers;
    
    -- Об'єднана політика для SELECT
    CREATE POLICY "kanban_column_workers_select_policy" ON kanban_column_workers
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM kanban_columns kc
          WHERE kc.id = kanban_column_workers.column_id
          AND (
            kc.department = public.user_department()
            OR public.user_role() = 'super_manager'
            OR kanban_column_workers.worker_id = public.auth_uid_cached()
          )
        )
      );
    
    -- Окремі політики для INSERT, UPDATE, DELETE (не ALL, щоб уникнути конфлікту)
    CREATE POLICY "kanban_column_workers_insert_policy" ON kanban_column_workers
      FOR INSERT WITH CHECK (
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
    
    CREATE POLICY "kanban_column_workers_update_policy" ON kanban_column_workers
      FOR UPDATE USING (
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
    
    CREATE POLICY "kanban_column_workers_delete_policy" ON kanban_column_workers
      FOR DELETE USING (
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
  END IF;
END $$;

-- ============================================================================
-- 2.6. TASK_CHAT_MESSAGES TABLE (оптимізація для Auth RLS Initialization Plan)
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'task_chat_messages'
  ) THEN
    -- Видаляємо старі політики
    DROP POLICY IF EXISTS "Users can view messages for their tasks" ON task_chat_messages;
    DROP POLICY IF EXISTS "Users can send messages" ON task_chat_messages;
    DROP POLICY IF EXISTS "task_chat_messages_select_policy" ON task_chat_messages;
    DROP POLICY IF EXISTS "task_chat_messages_insert_policy" ON task_chat_messages;
    
    -- Оптимізована політика для SELECT (використовуємо кешовану функцію)
    CREATE POLICY "task_chat_messages_select_policy" ON task_chat_messages
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM calendar_events ce
          WHERE ce.id = task_chat_messages.calendar_event_id
          AND (
            ce.worker_id = public.auth_uid_cached()
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
    
    -- Оптимізована політика для INSERT (використовуємо кешовану функцію)
    CREATE POLICY "task_chat_messages_insert_policy" ON task_chat_messages
      FOR INSERT WITH CHECK (
        sender_id = public.auth_uid_cached()
        AND EXISTS (
          SELECT 1 FROM calendar_events ce
          WHERE ce.id = task_chat_messages.calendar_event_id
          AND (
            ce.worker_id = public.auth_uid_cached()
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
  END IF;
END $$;

-- ============================================================================
-- ПЕРЕВІРКА СТРУКТУРИ ТАБЛИЦЬ (для діагностики)
-- ============================================================================

-- Перевірка, які колонки є в task_workflows
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'task_workflows'
ORDER BY ordinal_position;

-- Перевірка функцій
SELECT 
  proname as function_name,
  prosecdef as is_security_definer,
  proconfig as search_path_config
FROM pg_proc 
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('user_role', 'user_department', 'handle_new_user', 'update_updated_at_column', 'update_chat_room_last_message')
ORDER BY proname;

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
  AND tablename IN ('profiles', 'task_workflows', 'user_invitations', 'kanban_columns', 'kanban_column_workers', 'task_chat_messages')
ORDER BY tablename, policyname;

