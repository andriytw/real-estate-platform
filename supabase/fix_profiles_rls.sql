-- Виправлення RLS policies для таблиці profiles
-- Це дозволить авторизованим користувачам читати свій профіль

-- Дозволити користувачам читати свій власний профіль
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- Дозволити користувачам оновлювати свій власний профіль
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Дозволити менеджерам бачити профілі в своєму департаменті
DROP POLICY IF EXISTS "Managers can view all profiles in department" ON profiles;
CREATE POLICY "Managers can view all profiles in department" ON profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('manager', 'super_manager')
      AND p.department = profiles.department
    )
  );

-- Дозволити супер менеджерам бачити всі профілі
DROP POLICY IF EXISTS "Super managers can view all profiles" ON profiles;
CREATE POLICY "Super managers can view all profiles" ON profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'super_manager'
    )
  );

-- Дозволити створення профілів через тригер (handle_new_user)
-- Це вже налаштовано в migration_kanban_auth.sql

-- Перевірка: виконайте цей запит після входу
-- SELECT * FROM profiles WHERE id = auth.uid();

