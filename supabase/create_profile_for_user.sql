-- Створення профілю для існуючого користувача
-- Використовуйте цей скрипт, якщо користувач вже зареєстрований в auth.users, але не має профілю в profiles

-- Замініть 'at@herorooms.de' на email користувача, для якого потрібно створити профіль
DO $$
DECLARE
  user_id UUID;
  user_email TEXT := 'at@herorooms.de';
BEGIN
  -- Знайти ID користувача за email
  SELECT id INTO user_id
  FROM auth.users
  WHERE email = user_email;
  
  IF user_id IS NULL THEN
    RAISE EXCEPTION 'Користувач з email % не знайдений в auth.users', user_email;
  END IF;
  
  -- Перевірити, чи профіль вже існує
  IF EXISTS (SELECT 1 FROM profiles WHERE id = user_id) THEN
    RAISE NOTICE 'Профіль для користувача % вже існує', user_email;
  ELSE
    -- Створити профіль
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
    
    RAISE NOTICE 'Профіль успішно створено для користувача %', user_email;
  END IF;
END $$;

-- Перевірка: показати всі профілі
SELECT 
  p.id,
  p.name,
  p.role,
  p.department,
  p.is_active,
  u.email
FROM profiles p
LEFT JOIN auth.users u ON p.id = u.id
ORDER BY p.created_at DESC;

