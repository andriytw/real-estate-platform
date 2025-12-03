# Міграція на Supabase - Інструкція

## ✅ Що вже зроблено:

1. ✅ Створено SQL схему (`supabase/schema.sql`)
2. ✅ Створено service файл (`services/supabaseService.ts`)
3. ✅ Інтегровано Supabase в `App.tsx`
4. ✅ Додано fallback на mock дані якщо Supabase недоступний

## 📋 Наступні кроки:

### 1. Створити таблиці в Supabase

1. Відкрийте [Supabase Dashboard](https://supabase.com/dashboard)
2. Виберіть ваш проект
3. Перейдіть в **SQL Editor**
4. Відкрийте файл `supabase/schema.sql`
5. Скопіюйте весь вміст
6. Вставте в SQL Editor
7. Натисніть **Run**

### 2. Перевірити таблиці

Після виконання SQL:
- Перейдіть в **Table Editor**
- Переконайтеся що всі таблиці створені
- Перевірте що Row Level Security (RLS) увімкнено

### 3. Налаштувати Vercel

1. Відкрийте [Vercel Dashboard](https://vercel.com/dashboard)
2. Виберіть ваш проект
3. Перейдіть в **Settings** → **Environment Variables**
4. Додайте змінні:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://qcpuzfhawcondygspiok.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `sb_publishable_cpQrhzVqZRCCeULDWhVJJw_ZIhcLx0Y`
5. Натисніть **Save**
6. Перезапустіть деплой (Redeploy)

### 4. Імпортувати mock дані (опціонально)

Якщо хочете перенести існуючі mock дані:

```typescript
// Створіть тимчасовий скрипт для імпорту
import { propertiesService } from './services/supabaseService';
import { MOCK_PROPERTIES } from './constants';

async function importMockData() {
  for (const property of MOCK_PROPERTIES) {
    try {
      await propertiesService.create(property);
      console.log(`Imported: ${property.title}`);
    } catch (error) {
      console.error(`Error importing ${property.title}:`, error);
    }
  }
}
```

### 5. Тестування

1. Запустіть локально: `npm run dev`
2. Відкрийте `http://localhost:3000`
3. Перевірте що дані завантажуються з Supabase
4. Спробуйте створити/редагувати/видалити запис

## 🔄 Як працює інтеграція:

- **App.tsx** автоматично завантажує properties з Supabase при старті
- Якщо Supabase недоступний - використовує mock дані як fallback
- Всі операції (CRUD) доступні через `services/supabaseService.ts`

## 📝 Наступні інтеграції:

- [ ] AccountDashboard - інтегрувати bookings, invoices, leads
- [ ] BookingForm - зберігати requests в Supabase
- [ ] PropertyDetails - оновлювати property дані
- [ ] Calendar - синхронізувати events з Supabase

## ⚠️ Важливо:

- Row Level Security (RLS) налаштована на "allow all" для початку
- Пізніше можна обмежити доступ через RLS policies
- Всі таблиці мають автоматичне оновлення `updated_at`
- UUID використовується як primary key

