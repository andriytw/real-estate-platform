<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# BIM/LAF Real Estate Management Platform

Платформа для управління нерухомістю з повним функціоналом для бронювання, маркетплейсу та адміністрування.

## 🚀 Швидкий старт

### Клонування на MacBook (рекомендовано)

**Вимоги:** Node.js 18+ та npm

1. Клонуйте репозиторій:
   ```bash
   git clone https://github.com/andriytw/real-estate-platform.git
   cd real-estate-platform
   ```

2. Створіть файл `.env.local`:
   ```bash
   touch .env.local
   ```
   
   Додайте вміст:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://qcpuzfhawcondygspiok.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_cpQrhzVqZRCCeULDWhVJJw_ZIhcLx0Y
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

3. Встановіть залежності:
   ```bash
   npm install
   ```

4. Запустіть проект:
   ```bash
   npm run dev
   ```

5. Відкрийте браузер на `http://localhost:5173`

📖 **Детальні інструкції:** Дивіться `CLONE_ON_MACBOOK.md`

### Локальний запуск (загальний)

**Вимоги:** Node.js 18+ та npm

1. Встановіть залежності:
   ```bash
   npm install
   ```

2. Створіть файл `.env.local` та додайте ваші ключі:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://qcpuzfhawcondygspiok.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_cpQrhzVqZRCCeULDWhVJJw_ZIhcLx0Y
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

3. Запустіть проект:
   ```bash
   npm run dev
   ```

4. Відкрийте браузер на `http://localhost:5173`

## 📦 Деплой на Vercel

### Через GitHub

1. **Створіть репозиторій на GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/your-username/your-repo-name.git
   git push -u origin main
   ```

2. **Підключіть до Vercel:**
   - Перейдіть на [vercel.com](https://vercel.com)
   - Натисніть "New Project"
   - Імпортуйте ваш GitHub репозиторій
   - Vercel автоматично визначить налаштування з `vercel.json`
   - Додайте змінні оточення (якщо потрібно):
     - `GEMINI_API_KEY` (якщо використовуєте AI функції)

3. **Деплой:**
   - Vercel автоматично задеплоїть проект
   - Кожен push до `main` гілки автоматично створює новий деплой

### Через Vercel CLI

1. Встановіть Vercel CLI:
   ```bash
   npm i -g vercel
   ```

2. Деплой:
   ```bash
   vercel
   ```

3. Для продакшн деплою:
   ```bash
   vercel --prod
   ```

## 🔧 Налаштування

### Змінні оточення

Створіть файл `.env.local` для локальної розробки:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

Для Vercel, додайте змінні оточення в налаштуваннях проекту:
- Settings → Environment Variables

### Build команди

- `npm run dev` - запуск dev сервера
- `npm run build` - збірка для продакшн
- `npm run preview` - перегляд продакшн збірки локально

## 📁 Структура проекту

```
├── components/          # React компоненти
├── constants.ts         # Константи та mock дані
├── types.ts            # TypeScript типи
├── App.tsx             # Головний компонент
├── index.tsx           # Точка входу
├── vite.config.ts      # Vite конфігурація
├── vercel.json         # Vercel конфігурація
└── package.json        # Залежності та скрипти
```

## 🛠 Технології

- **React 19** - UI бібліотека
- **TypeScript** - типізація
- **Vite** - збірщик та dev сервер
- **Tailwind CSS** - стилізація (через CDN)
- **Lucide React** - іконки
- **Three.js** - 3D візуалізація
- **Supabase** - база даних та backend (через `@supabase/supabase-js` та `@supabase/ssr`)

## 📝 Примітки

- Проект налаштований для автоматичного деплою на Vercel
- Всі статичні файли кешуються для кращої продуктивності
- SPA routing налаштований через Vercel rewrites

## 🔗 Посилання

- View your app in AI Studio: https://ai.studio/apps/drive/1ytg8VVFEJwlGc0H_uMu2Wp09i5ReI63T
