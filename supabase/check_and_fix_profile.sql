-- Перевірка та виправлення профілю для користувача at@herorooms.de
-- Виконайте цей скрипт в Supabase SQL Editor

-- Крок 1: Знайти користувача в auth.users
SELECT 
  'Користувач в auth.users:' as info,
  id,
  email,
  created_at
FROM auth.users
WHERE email = 'at@herorooms.de';

-- Крок 2: Перевірити, чи є профіль для цього користувача
SELECT 
  'Профіль в profiles:' as info,
  p.id,
  p.name,
  p.email,
  p.department,
  p.role,
  p.is_active,
  u.email as auth_email
FROM profiles p
LEFT JOIN auth.users u ON p.id = u.id
WHERE u.email = 'at@herorooms.de' OR p.id = (SELECT id FROM auth.users WHERE email = 'at@herorooms.de');

-- Крок 3: Створити або оновити профіль
DO $$
DECLARE
  user_id UUID;
  user_email TEXT := 'at@herorooms.de';
  profile_exists BOOLEAN;
BEGIN
  -- Знайти ID користувача за email
  SELECT id INTO user_id
  FROM auth.users
  WHERE email = user_email;
  
  IF user_id IS NULL THEN
    RAISE EXCEPTION '❌ Користувач з email % не знайдений в auth.users. Спочатку створіть користувача через Authentication → Users', user_email;
  END IF;
  
  -- Перевірити, чи профіль вже існує
  SELECT EXISTS(SELECT 1 FROM profiles WHERE id = user_id) INTO profile_exists;
  
  IF profile_exists THEN
    -- Оновити існуючий профіль
    UPDATE profiles
    SET 
      name = 'Super Admin',
      department = 'facility',
      role = 'super_manager',
      is_active = true,
      updated_at = NOW()
    WHERE id = user_id;
    
    RAISE NOTICE '✅ Профіль оновлено для користувача % (ID: %)', user_email, user_id;
  ELSE
    -- Створити новий профіль
    INSERT INTO profiles (
      id,
      name,
      department,
      role,
      is_active,
      created_at,
      updated_at
    ) VALUES (
      user_id,
      'Super Admin',
      'facility',
      'super_manager',
      true,
      NOW(),
      NOW()
    );
    
    RAISE NOTICE '✅ Профіль створено для користувача % (ID: %)', user_email, user_id;
  END IF;
END $$;

-- Крок 4: Фінальна перевірка
SELECT 
  '✅ Фінальна перевірка:' as info,
  p.id,
  p.name,
  u.email,
  p.department,
  p.role,
  p.is_active,
  p.created_at,
  p.updated_at
FROM profiles p
JOIN auth.users u ON p.id = u.id
WHERE u.email = 'at@herorooms.de';

