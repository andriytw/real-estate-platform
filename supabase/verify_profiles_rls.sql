-- Перевірка та виправлення RLS політик для таблиці profiles
-- Цей скрипт перевіряє, чи користувач може читати свій профіль

-- 1. Перевірка, чи RLS увімкнено
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' AND tablename = 'profiles';

-- 2. Перевірка поточних політик
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE schemaname = 'public' AND tablename = 'profiles'
ORDER BY policyname;

-- 3. Перевірка, чи auth.uid() працює
-- Виконайте це після входу в систему:
-- SELECT auth.uid() as current_user_id;

-- 4. Перевірка, чи користувач може прочитати свій профіль
-- Виконайте це після входу в систему:
-- SELECT * FROM profiles WHERE id = auth.uid();

-- 5. Якщо потрібно, створіть/оновіть політики
-- Спочатку видалити всі старі політики
DO $$ 
BEGIN
  -- Видалити всі існуючі політики для profiles
  DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
  DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
  DROP POLICY IF EXISTS "Managers can view all profiles in department" ON profiles;
  DROP POLICY IF EXISTS "Super managers can view all profiles" ON profiles;
  DROP POLICY IF EXISTS "profiles_select_policy" ON profiles;
  DROP POLICY IF EXISTS "profiles_update_policy" ON profiles;
END $$;

-- Переконатися, що RLS увімкнено
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Створити прості політики, які точно працюють
-- Користувач може читати свій власний профіль
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT 
  USING (auth.uid() = id);

-- Користувач може оновлювати свій власний профіль
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE 
  USING (auth.uid() = id);

-- Менеджери та супер менеджери можуть читати всі профілі
-- Використовуємо функцію user_role() для перевірки
CREATE POLICY "Managers can view all profiles" ON profiles
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM profiles p 
      WHERE p.id = auth.uid() 
      AND p.role IN ('manager', 'super_manager')
    )
  );

-- Супер менеджери можуть читати всі профілі (більш проста версія)
CREATE POLICY "Super managers can view all profiles" ON profiles
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM profiles p 
      WHERE p.id = auth.uid() 
      AND p.role = 'super_manager'
    )
  );

-- Перевірка після виконання:
-- 1. Перевірте, чи політики створені:
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'profiles';

-- 2. Після входу в систему, перевірте:
-- SELECT auth.uid();
-- SELECT * FROM profiles WHERE id = auth.uid();

