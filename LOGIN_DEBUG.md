# 🔍 Діагностика проблеми з логіном

## Що зроблено:

✅ Додано детальне логування в:
- `contexts/WorkerContext.tsx` - логування процесу логіну
- `utils/supabase/client.ts` - логування ініціалізації клієнта

## Як діагностувати проблему:

### 1. Відкрийте консоль браузера

1. Відкрийте сайт на Vercel
2. Натисніть `F12` або `Cmd+Option+I` (Mac) / `Ctrl+Shift+I` (Windows)
3. Перейдіть на вкладку "Console"

### 2. Спробуйте залогінитися

Введіть:
- Email: `at@herorooms.de`
- Password: `Tsero6730451!`

### 3. Перевірте логи в консолі

Ви маєте побачити такі логи:

**Якщо все працює:**
```
✅ Supabase client initialized with URL: https://qcpuzfhawcondygspiok...
🔐 Attempting login for: at@herorooms.de
✅ Auth successful, user ID: [UUID]
🔄 Refreshing worker profile...
🔍 Getting current user from Supabase Auth...
✅ User found: [UUID] at@herorooms.de
🔍 Fetching profile from profiles table...
✅ Profile found: Super Admin super_manager facility
✅ Worker profile refreshed
```

**Якщо є проблема з Environment Variables:**
```
❌ Missing Supabase environment variables.
Available env vars: { VITE_SUPABASE_URL: false, ... }
```

**Якщо є проблема з автентифікацією:**
```
❌ Supabase auth error: [error details]
```

**Якщо є проблема з профілем:**
```
✅ Auth successful, user ID: [UUID]
🔄 Refreshing worker profile...
❌ Profile fetch error: [error details]
⚠️ No profile found for user: [UUID]
💡 Profile needs to be created in Supabase for user: [UUID]
```

## Можливі проблеми та рішення:

### Проблема 1: Environment Variables не налаштовані в Vercel

**Симптоми:** Помилка "Missing Supabase environment variables"

**Рішення:**
1. Відкрийте Vercel Dashboard
2. Settings → Environment Variables
3. Додайте:
   - `VITE_SUPABASE_URL` = `https://qcpuzfhawcondygspiok.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = `sb_publishable_cpQrhzVqZRCCeULDWhVJJw_ZIhcLx0Y`
4. Перезапустіть deployment

### Проблема 2: Профіль не знайдено

**Симптоми:** "No profile found for user"

**Рішення:**
1. Перевірте в Supabase Dashboard:
   - Table Editor → `profiles`
   - Чи є запис з `id` = UUID користувача `at@herorooms.de`?
2. Якщо немає - створіть профіль:
   ```sql
   INSERT INTO profiles (id, name, department, role, is_active)
   VALUES (
     (SELECT id FROM auth.users WHERE email = 'at@herorooms.de'),
     'Super Admin',
     'facility',
     'super_manager',
     true
   );
   ```

### Проблема 3: RLS policies блокують доступ

**Симптоми:** "Profile fetch error" з кодом 42501 або "permission denied"

**Рішення:**
1. Перевірте RLS policies в Supabase:
   - Table Editor → `profiles` → RLS Policies
2. Переконайтеся, що є policy для читання власного профілю
3. Якщо потрібно - виконайте `supabase/fix_profiles_rls_no_recursion.sql`

### Проблема 4: Неправильний email або пароль

**Симптоми:** "Invalid login credentials"

**Рішення:**
1. Перевірте email: `at@herorooms.de`
2. Перевірте пароль: `Tsero6730451!`
3. Спробуйте скинути пароль в Supabase Dashboard:
   - Authentication → Users → Знайдіть користувача → Reset Password

## Швидка перевірка:

1. **Environment Variables:**
   - Відкрийте консоль браузера
   - Шукайте: "Supabase client initialized"
   - Якщо немає - Environment Variables не налаштовані

2. **Автентифікація:**
   - Шукайте: "Auth successful"
   - Якщо немає - проблема з email/паролем або Supabase Auth

3. **Профіль:**
   - Шукайте: "Profile found"
   - Якщо немає - профіль не створено або RLS блокують

---

**Після виправлення:** Зачекайте 1-2 хвилини на новий deployment і спробуйте знову.

