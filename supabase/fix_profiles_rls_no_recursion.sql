-- Виправлення RLS policies для таблиці profiles БЕЗ рекурсії
-- Проблема: policies використовували SELECT FROM profiles, що викликало рекурсію
-- Рішення: використовуємо функцію SECURITY DEFINER для перевірки ролі

-- Спочатку видалити всі старі policies
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Managers can view all profiles in department" ON profiles;
DROP POLICY IF EXISTS "Super managers can view all profiles" ON profiles;

-- Створити функцію для отримання ролі користувача (без рекурсії)
-- Використовуємо схему public, бо auth - захищена схема
CREATE OR REPLACE FUNCTION public.user_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Створити функцію для отримання департаменту користувача (без рекурсії)
CREATE OR REPLACE FUNCTION public.user_department()
RETURNS TEXT AS $$
  SELECT department FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Дозволити користувачам читати свій власний профіль
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- Дозволити користувачам оновлювати свій власний профіль
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Дозволити менеджерам бачити профілі в своєму департаменті
-- Використовуємо функції для уникнення рекурсії
CREATE POLICY "Managers can view all profiles in department" ON profiles
  FOR SELECT USING (
    public.user_role() IN ('manager', 'super_manager')
    AND department = public.user_department()
  );

-- Дозволити супер менеджерам бачити всі профілі
CREATE POLICY "Super managers can view all profiles" ON profiles
  FOR SELECT USING (
    public.user_role() = 'super_manager'
  );

-- Перевірка: після входу виконайте
-- SELECT * FROM profiles WHERE id = auth.uid();
