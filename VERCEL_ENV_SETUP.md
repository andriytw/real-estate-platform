# Налаштування Environment Variables в Vercel

## ⚠️ ВАЖЛИВО: Додайте ці змінні ПЕРЕД деплоєм!

Оскільки Vercel вже підключений до GitHub, автоматичний деплой працює. Але **обов'язково** додайте environment variables:

## Крок 1: Відкрийте Vercel Dashboard

1. Перейдіть на [vercel.com/dashboard](https://vercel.com/dashboard)
2. Виберіть ваш проект `real-estate-platform`

## Крок 2: Додайте Environment Variables

1. Перейдіть в **Settings** → **Environment Variables**
2. Додайте наступні змінні:

### Змінна 1:
- **Key:** `NEXT_PUBLIC_SUPABASE_URL`
- **Value:** `https://qcpuzfhawcondygspiok.supabase.co`
- **Environment:** ☑️ Production ☑️ Preview ☑️ Development
- Натисніть **Save**

### Змінна 2:
- **Key:** `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Value:** `sb_publishable_cpQrhzVqZRCCeULDWhVJJw_ZIhcLx0Y`
- **Environment:** ☑️ Production ☑️ Preview ☑️ Development
- Натисніть **Save**

## Крок 3: Перезапустіть деплой

Після додавання змінних:

1. Перейдіть в **Deployments**
2. Знайдіть останній деплой
3. Натисніть **⋯** (три крапки) → **Redeploy**

АБО просто зробіть новий commit:
```bash
git add .
git commit -m "Add Supabase integration"
git push origin main
```

Vercel автоматично задеплоїть нову версію з environment variables.

## Перевірка

Після деплою:
1. Відкрийте ваш сайт на Vercel
2. Відкрийте консоль браузера (F12)
3. Перевірте що немає помилок підключення до Supabase
4. Спробуйте завантажити дані - мають завантажуватися з Supabase

## Важливо

- ✅ Змінні з префіксом `NEXT_PUBLIC_` доступні в браузері
- ✅ Vercel автоматично перезапустить деплой після зміни env variables
- ⚠️ Без цих змінних сайт не зможе підключитися до Supabase

