-- Прості RLS політики для profiles БЕЗ рекурсії
-- Використовуємо тільки auth.uid() без додаткових функцій

-- 1. Видалити всі існуючі політики
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
  DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
  DROP POLICY IF EXISTS "Managers can view all profiles in department" ON profiles;
  DROP POLICY IF EXISTS "Super managers can view all profiles" ON profiles;
  DROP POLICY IF EXISTS "profiles_select_policy" ON profiles;
  DROP POLICY IF EXISTS "profiles_update_policy" ON profiles;
  DROP POLICY IF EXISTS "Managers can view all profiles" ON profiles;
END $$;

-- 2. Переконатися, що RLS увімкнено
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 4. Створити найпростіші політики (без рекурсії)
-- Користувач може читати свій власний профіль
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT 
  USING (auth.uid() = id);

-- Користувач може оновлювати свій власний профіль
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE 
  USING (auth.uid() = id);

-- 4. Для менеджерів та супер менеджерів - використовуємо SECURITY DEFINER функцію
-- Спочатку створити функцію для перевірки ролі (без рекурсії)
-- Використовуємо повний шлях до таблиці через public.profiles
CREATE OR REPLACE FUNCTION public.check_user_role(check_role TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND role = check_role
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = '';

-- Функція для перевірки, чи користувач менеджер або супер менеджер
CREATE OR REPLACE FUNCTION public.is_manager_or_super()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND role IN ('manager', 'super_manager')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = '';

-- Менеджери та супер менеджери можуть читати всі профілі
CREATE POLICY "Managers can view all profiles" ON public.profiles
  FOR SELECT 
  USING (public.is_manager_or_super());

-- Супер менеджери можуть читати всі профілі (дублювання для надійності)
CREATE POLICY "Super managers can view all profiles" ON public.profiles
  FOR SELECT 
  USING (public.check_user_role('super_manager'));

-- 5. Перевірка після виконання
-- Виконайте ці запити після входу в систему:

-- Перевірка політик:
SELECT policyname, cmd, qual::text as condition 
FROM pg_policies 
WHERE schemaname = 'public' AND tablename = 'profiles'
ORDER BY policyname;

-- Перевірка, чи auth.uid() працює:
-- SELECT auth.uid() as current_user_id;

-- Перевірка, чи користувач може прочитати свій профіль:
-- SELECT * FROM public.profiles WHERE id = auth.uid();

-- Перевірка функцій:
SELECT 
  proname as function_name,
  prosrc as function_body
FROM pg_proc 
WHERE proname IN ('check_user_role', 'is_manager_or_super')
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

