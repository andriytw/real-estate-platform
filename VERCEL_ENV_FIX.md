# 🔧 Виправлення Environment Variables в Vercel

## Проблема
В Vercel є тільки `NEXT_PUBLIC_` змінні, але Vite потребує `VITE_` префікс.

## Рішення

### Додайте нові Environment Variables:

1. Відкрийте **Vercel Dashboard** → **Settings** → **Environment Variables**

2. Натисніть **Add New**

3. Додайте першу змінну:
   - **Key:** `VITE_SUPABASE_URL`
   - **Value:** `https://qcpuzfhawcondygspiok.supabase.co`
   - **Environment:** Оберіть **Production**, **Preview**, **Development**
   - Натисніть **Save**

4. Додайте другу змінну:
   - **Key:** `VITE_SUPABASE_ANON_KEY`
   - **Value:** `sb_publishable_cpQrhzVqZRCCeULDWhVJJw_ZIhcLx0Y`
   - **Environment:** Оберіть **Production**, **Preview**, **Development**
   - Натисніть **Save**

### Після додавання:

1. Відкрийте **Deployments**
2. Знайдіть останній deployment
3. Натисніть **⋯** → **Redeploy**
4. Зачекайте 1-2 хвилини

### Перевірка:

Після redeploy спробуйте залогінитися:
- Email: `at@herorooms.de`
- Password: `Tsero6730451!`

---

**Примітка:** Код підтримує обидва префікси (`VITE_` та `NEXT_PUBLIC_`), але `VITE_` має пріоритет для Vite.


