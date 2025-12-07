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

-- Fix user_role()
CREATE OR REPLACE FUNCTION public.user_role()
RETURNS TEXT 
LANGUAGE sql 
SECURITY DEFINER 
STABLE
SET search_path = ''
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- Fix user_department()
CREATE OR REPLACE FUNCTION public.user_department()
RETURNS TEXT 
LANGUAGE sql 
SECURITY DEFINER 
STABLE
SET search_path = ''
AS $$
  SELECT department FROM public.profiles WHERE id = auth.uid();
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

-- Об'єднана політика для SELECT
CREATE POLICY "profiles_select_policy" ON profiles
  FOR SELECT USING (
    auth.uid() = id
    OR
    (
      public.user_role() IN ('manager', 'super_manager')
      AND department = public.user_department()
    )
    OR
    (public.user_role() = 'super_manager')
  );

-- Політика для UPDATE
CREATE POLICY "profiles_update_policy" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- ============================================================================
-- 2.2. TASK_WORKFLOWS TABLE (з перевіркою існування)
-- ============================================================================

DO $$
BEGIN
  -- Перевіряємо, чи існує таблиця та колонка worker_id
  IF EXISTS (
    SELECT 1 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'task_workflows'
  ) AND EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'task_workflows' 
    AND column_name = 'worker_id'
  ) THEN
    -- Видаляємо старі політики
    DROP POLICY IF EXISTS "Workers can manage own workflows" ON task_workflows;
    DROP POLICY IF EXISTS "Managers can view department workflows" ON task_workflows;
    DROP POLICY IF EXISTS "Managers can update department workflows" ON task_workflows;
    DROP POLICY IF EXISTS "task_workflows_select_policy" ON task_workflows;
    DROP POLICY IF EXISTS "task_workflows_update_policy" ON task_workflows;
    DROP POLICY IF EXISTS "task_workflows_insert_policy" ON task_workflows;
    
    -- Створюємо нові об'єднані політики
    CREATE POLICY "task_workflows_select_policy" ON task_workflows
      FOR SELECT USING (
        auth.uid() = worker_id
        OR
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid() 
          AND role IN ('manager', 'super_manager')
        )
      );
    
    CREATE POLICY "task_workflows_update_policy" ON task_workflows
      FOR UPDATE USING (
        auth.uid() = worker_id
        OR
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid() 
          AND role IN ('manager', 'super_manager')
        )
      );
    
    CREATE POLICY "task_workflows_insert_policy" ON task_workflows
      FOR INSERT WITH CHECK (auth.uid() = worker_id);
  ELSE
    RAISE NOTICE 'Table task_workflows does not exist or does not have worker_id column. Skipping policies.';
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
    
    -- Створюємо об'єднані політики
    CREATE POLICY "user_invitations_select_policy" ON user_invitations
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid() 
          AND role IN ('manager', 'super_manager')
        )
      );
    
    CREATE POLICY "user_invitations_insert_policy" ON user_invitations
      FOR INSERT WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid() 
          AND role IN ('manager', 'super_manager')
        )
      );
    
    CREATE POLICY "user_invitations_update_policy" ON user_invitations
      FOR UPDATE USING (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid() 
          AND role IN ('manager', 'super_manager')
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
  AND tablename IN ('profiles', 'task_workflows', 'user_invitations')
ORDER BY tablename, policyname;

