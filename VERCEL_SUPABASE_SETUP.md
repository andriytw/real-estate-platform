# Налаштування Vercel з Supabase

## Крок 1: Додати Environment Variables в Vercel

1. Відкрийте [Vercel Dashboard](https://vercel.com/dashboard)
2. Виберіть ваш проект `real-estate-platform`
3. Перейдіть в **Settings** → **Environment Variables**
4. Додайте наступні змінні:

### Для Production:
- **Name:** `NEXT_PUBLIC_SUPABASE_URL`
- **Value:** `https://qcpuzfhawcondygspiok.supabase.co`
- **Environment:** Production, Preview, Development

- **Name:** `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Value:** `sb_publishable_cpQrhzVqZRCCeULDWhVJJw_ZIhcLx0Y`
- **Environment:** Production, Preview, Development

5. Натисніть **Save** для кожної змінної

## Крок 2: Перезапустити деплой

1. Перейдіть в **Deployments**
2. Знайдіть останній деплой
3. Натисніть **⋯** (три крапки)
4. Виберіть **Redeploy**

Або просто зробіть новий commit і push:
```bash
git add .
git commit -m "Add Supabase integration"
git push origin main
```

## Крок 3: Перевірити

1. Після деплою відкрийте ваш сайт на Vercel
2. Перевірте консоль браузера (F12) на наявність помилок
3. Перевірте що дані завантажуються з Supabase

## Важливо

- Змінні з префіксом `NEXT_PUBLIC_` доступні в браузері
- Не додавайте secret keys в `NEXT_PUBLIC_` змінні
- Vercel автоматично перезапустить деплой після зміни env variables

