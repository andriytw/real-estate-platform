# Supabase Setup Guide

## Встановлення пакетів

Встановіть необхідні пакети Supabase:

```bash
npm install @supabase/supabase-js @supabase/ssr
```

## Структура файлів

Створено наступні файли для роботи з Supabase:

### 1. `utils/supabase/client.ts`
Клієнт для Client Components (використовується в браузері)

### 2. `utils/supabase/server.ts`
Клієнт для Server Components/Actions (для Next.js App Router)

### 3. `utils/supabase/middleware.ts`
Middleware для оновлення сесії (для Next.js)

### 4. `components/TestDB.tsx`
Тестова сторінка для перевірки підключення до Supabase

## Налаштування змінних оточення

Файл `.env.local` вже створено з наступними змінними:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**Важливо:** Vite автоматично експортує змінні з префіксом `VITE_` або `NEXT_PUBLIC_` (завдяки налаштуванню `envPrefix` в `vite.config.ts`).

## Доступ до тестової сторінки

### Варіант 1: Через код
Додайте в `App.tsx` тимчасово:
```typescript
setCurrentView('test-db')
```

### Варіант 2: Через URL (якщо налаштовано роутинг)
Відкрийте в браузері: `http://localhost:3000/test-db`

### Варіант 3: Додати кнопку в Navbar
Можна додати кнопку в навігацію для швидкого доступу.

## Перевірка підключення

Після встановлення пакетів та запуску додатку:

1. Відкрийте тестову сторінку
2. Перевірте статус підключення
3. Якщо все добре, ви побачите "Connection Successful!"

## Примітки

- Файли `server.ts` та `middleware.ts` призначені для Next.js App Router
- Для поточного Vite-проєкту використовується тільки `client.ts`
- При міграції на Next.js, всі файли будуть готові до використання


