# Карта /market та геокодування — що зробити

## 1. Міграція в Supabase (якщо ще не виконана)

У **Supabase Dashboard → SQL Editor** виконай вміст файлу:

`supabase/migrations/20260304120000_add_properties_lat_lng.sql`

(колонки `lat`, `lng`, `geocoded_at`, … та індекс `properties_lat_lng_idx`).

## 2. Локальний .env

У корені проєкту в `.env` мають бути:

- `NEXT_PUBLIC_MAPBOX_TOKEN` — вже додано.
- `SUPABASE_URL` або `NEXT_PUBLIC_SUPABASE_URL` — URL проєкту Supabase.
- `SUPABASE_SERVICE_ROLE_KEY` — **service role** ключ (Supabase Dashboard → Settings → API → service_role). Потрібен лише для скрипта бекфілу.

## 3. Запуск бекфілу геокодування (заповнити lat/lng)

Один раз у терміналі:

```bash
export $(grep -v '^#' .env | xargs)
npm run backfill:geocode-properties
```

Якщо змінні вже в `.env`, достатньо:

```bash
npm run backfill:geocode-properties
```

Скрипт обробить об’єкти без координат, викличе Mapbox Geocoding і оновить `lat`/`lng`.

## 4. Vercel (продакшн)

У проєкті на **Vercel → Settings → Environment Variables** додай:

- `NEXT_PUBLIC_MAPBOX_TOKEN` = той самий публічний Mapbox-токен.

Після збереження змін зроби **Redeploy**, щоб карта на проді підхопила токен.

## Перевірка

- Відкрити `/market`: зліва список, справа карта; клік по картці — flyTo; пошук адреси — пін і відстані.
- Маркери з’являються лише у об’єктів з заповненими `lat`/`lng` (після бекфілу або ручного заповнення).
