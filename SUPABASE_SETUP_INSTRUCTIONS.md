# Інструкція по налаштуванню Supabase

## Крок 1: Створити таблиці в Supabase

1. Відкрийте [Supabase Dashboard](https://supabase.com/dashboard)
2. Виберіть ваш проект
3. Перейдіть в **SQL Editor**
4. Відкрийте файл `supabase/schema.sql` з цього проекту
5. Скопіюйте весь вміст файлу
6. Вставте в SQL Editor
7. Натисніть **Run** або **Execute**

Це створить всі необхідні таблиці:
- `properties` - нерухомість
- `bookings` - бронювання
- `offers` - офери
- `invoices` - інвойси
- `leads` - ліди
- `requests` - запити
- `calendar_events` - події календаря
- `rooms` - кімнати/юніти
- `companies` - компанії

## Крок 2: Перевірка таблиць

Після виконання SQL:
1. Перейдіть в **Table Editor**
2. Переконайтеся що всі таблиці створені
3. Перевірте що Row Level Security (RLS) увімкнено

## Крок 3: Налаштування Vercel

1. Відкрийте [Vercel Dashboard](https://vercel.com/dashboard)
2. Виберіть ваш проект
3. Перейдіть в **Settings** → **Environment Variables**
4. Додайте змінні:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://qcpuzfhawcondygspiok.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `sb_publishable_cpQrhzVqZRCCeULDWhVJJw_ZIhcLx0Y`
5. Натисніть **Save**
6. Перезапустіть деплой (Redeploy)

## Крок 4: Міграція даних (опціонально)

Якщо у вас є існуючі mock дані, які потрібно перенести:

1. Відкрийте `constants.ts`
2. Скопіюйте дані з `MOCK_PROPERTIES`
3. Використайте функції з `services/supabaseService.ts` для імпорту

Або використайте Supabase Table Editor для ручного додавання даних.

## Крок 5: Тестування

1. Запустіть локально: `npm run dev`
2. Відкрийте `http://localhost:3000`
3. Перевірте що дані завантажуються з Supabase
4. Спробуйте створити/редагувати/видалити запис

## Важливо

- Row Level Security (RLS) налаштована на "allow all" для початку
- Пізніше можна обмежити доступ через RLS policies
- Всі таблиці мають автоматичне оновлення `updated_at`
- UUID використовується як primary key для всіх таблиць

