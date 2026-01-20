# 🌐 Всі важливі URL проекту

**Дата оновлення:** 2 січня 2026

---

## 🚀 Платформа (Додаток)

### Локальна розробка
- **URL:** `http://localhost:3000` або `http://localhost:5173`
- **Порт:** 3000 (налаштовано в `vite.config.ts`)
- **Запуск:** `npm run dev`

### Production (Vercel)
- **URL:** (потрібно перевірити в Vercel Dashboard)
- **Як знайти:**
  1. Відкрийте: https://vercel.com/dashboard
  2. Знайдіть проект `real-estate-platform`
  3. Скопіюйте URL з вкладки **Deployments**

---

## 🗄️ Supabase (База даних)

### Supabase Project URL
- **URL:** `https://qcpuzfhawcondygspiok.supabase.co`
- **Project Reference:** `qcpuzfhawcondygspiok`

### Supabase Dashboard
- **URL:** https://supabase.com/dashboard/project/qcpuzfhawcondygspiok
- **Або:** https://supabase.com/dashboard → виберіть проект

### Supabase API Endpoints

**REST API:**
- **URL:** `https://qcpuzfhawcondygspiok.supabase.co/rest/v1/`
- **Використання:** Автоматично через `@supabase/supabase-js`

**Auth API:**
- **URL:** `https://qcpuzfhawcondygspiok.supabase.co/auth/v1/`
- **Використання:** Автоматично через Supabase Auth

**Edge Functions:**

1. **OCR Invoice Function:**
   - **URL:** `https://qcpuzfhawcondygspiok.supabase.co/functions/v1/ocr-invoice`
   - **Метод:** POST
   - **Призначення:** OCR обробка інвойсів через Gemini API

2. **Invite User Function:**
   - **URL:** `https://qcpuzfhawcondygspiok.supabase.co/functions/v1/invite-user`
   - **Метод:** POST
   - **Призначення:** Запрошення користувачів

**Storage:**
- **URL:** `https://qcpuzfhawcondygspiok.supabase.co/storage/v1/`
- **Використання:** Для зберігання файлів, зображень

---

## 📦 GitHub (Код)

### Репозиторій
- **URL:** https://github.com/andriytw/real-estate-platform
- **Clone URL:** `https://github.com/andriytw/real-estate-platform.git`
- **SSH URL:** `git@github.com:andriytw/real-estate-platform.git`

### GitHub Settings
- **Tokens:** https://github.com/settings/tokens
- **New Repository:** https://github.com/new

---

## ☁️ Vercel (Деплой)

### Vercel Dashboard
- **URL:** https://vercel.com/dashboard
- **Project:** `real-estate-platform`

### Vercel Settings
- **Environment Variables:** https://vercel.com/dashboard → Settings → Environment Variables
- **Deployments:** https://vercel.com/dashboard → Deployments

---

## 🤖 Google Gemini API

### Google AI Studio
- **URL:** https://aistudio.google.com/app/apikey
- **Призначення:** Отримання API ключа для Gemini

### Gemini API Endpoint
- **URL:** `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash-latest:generateContent`
- **Модель:** `gemini-1.5-flash-latest`
- **Використання:** Через Supabase Edge Function `ocr-invoice`

---

## 🔧 Інструменти розробки

### Node.js
- **Офіційний сайт:** https://nodejs.org/
- **Завантаження:** https://nodejs.org/download

### Git
- **Офіційний сайт:** https://git-scm.com/
- **Завантаження:** https://git-scm.com/download/win (Windows)

---

## 📝 Документація

### Supabase
- **Документація:** https://supabase.com/docs
- **Dashboard:** https://supabase.com/dashboard

### Vite
- **Документація:** https://vitejs.dev/
- **React Plugin:** https://github.com/vitejs/vite-plugin-react

### React
- **Документація:** https://react.dev/

---

## 🔐 Налаштування (Environment Variables)

### Локальна розробка (`.env.local`)
```env
VITE_SUPABASE_URL=https://qcpuzfhawcondygspiok.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_cpQrhzVqZRCCeULDWhVJJw_ZIhcLx0Y
GEMINI_API_KEY=your_gemini_api_key_here
```

### Vercel (Environment Variables)
- **URL:** https://vercel.com/dashboard → Settings → Environment Variables
- **Додати:**
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `GEMINI_API_KEY` (опціонально)

### Supabase Edge Functions (Secrets)
- **URL:** https://supabase.com/dashboard/project/qcpuzfhawcondygspiok → Edge Functions → Settings → Secrets
- **Додати:**
  - `GEMINI_API_KEY` (для `ocr-invoice`)
  - `SERVICE_ROLE_KEY` (для `invite-user`)
  - `SUPABASE_URL` (опціонально)

---

## 🧪 Тестування

### Локальний тест
- **URL:** `http://localhost:3000`
- **Або:** `http://localhost:5173` (залежно від налаштувань)

### Test Database Page
- **URL:** `http://localhost:3000/test-db`
- **Призначення:** Перевірка підключення до Supabase

---

## 📊 Швидкий доступ

### Найчастіше використовувані:

1. **Локальна розробка:**
   ```
   http://localhost:3000
   ```

2. **Supabase Dashboard:**
   ```
   https://supabase.com/dashboard/project/qcpuzfhawcondygspiok
   ```

3. **GitHub репозиторій:**
   ```
   https://github.com/andriytw/real-estate-platform
   ```

4. **Vercel Dashboard:**
   ```
   https://vercel.com/dashboard
   ```

5. **Google AI Studio:**
   ```
   https://aistudio.google.com/app/apikey
   ```

---

## 🔗 Корисні посилання

### API Endpoints (автоматично використовуються в коді)

**Supabase REST:**
```
https://qcpuzfhawcondygspiok.supabase.co/rest/v1/{table}
```

**Supabase Auth:**
```
https://qcpuzfhawcondygspiok.supabase.co/auth/v1/{endpoint}
```

**Edge Functions:**
```
https://qcpuzfhawcondygspiok.supabase.co/functions/v1/{function-name}
```

**Storage:**
```
https://qcpuzfhawcondygspiok.supabase.co/storage/v1/{bucket}/{path}
```

---

## 📱 Мобільний доступ

### Worker Mobile App
- **URL:** `http://localhost:3000/worker`
- **Призначення:** Мобільний інтерфейс для працівників

### Admin Tasks Board
- **URL:** `http://localhost:3000/admin/tasks`
- **Призначення:** Kanban дошка для менеджерів

---

## ⚠️ Важливо

### Публічні URL (безпечно ділитися):
- ✅ GitHub репозиторій
- ✅ Supabase Project URL (захищений RLS)
- ✅ Supabase ANON KEY (захищений RLS)

### Секретні URL/ключі (НЕ ділитися):
- ❌ GEMINI_API_KEY
- ❌ SERVICE_ROLE_KEY
- ❌ Vercel deployment URL (якщо не публічний)
- ❌ Environment variables з реальними ключами

---

**Останнє оновлення:** 2 січня 2026
