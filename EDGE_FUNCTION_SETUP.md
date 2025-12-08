# Налаштування Edge Function для відправки запрошень користувачам

## Крок 1: Створити Edge Function в Supabase Dashboard

1. Відкрийте [Supabase Dashboard](https://supabase.com/dashboard)
2. Виберіть ваш проект `real-estate-platform`
3. Перейдіть в розділ **Functions** (в лівому меню)
4. Натисніть кнопку **"Create a new function"** або **"New Function"**

## Крок 2: Налаштування функції

1. **Function Name:** `invite-user`
2. **Template:** Оберіть "HTTP Request" або "Blank Function"
3. Натисніть **"Create function"**

## Крок 3: Вставити код

1. Відкрийте файл `supabase/functions/invite-user/index.ts` з цього проекту
2. Скопіюйте весь код з файлу
3. Вставте код в редактор Edge Function в Supabase Dashboard
4. Натисніть **"Deploy"** або **"Save"**

## Крок 4: Налаштування безпеки Edge Function

**ВАЖЛИВО:** Після деплою функції:

1. Відкрийте функцію `invite-user` в Supabase Dashboard
2. Перейдіть в розділ **"Function Configuration"**
3. Знайдіть опцію **"Verify JWT with legacy secret"**
4. **ВИМКНІТЬ** цю опцію (перемикач має бути вимкнений/OFF)
5. Натисніть **"Save changes"**

**Чому це потрібно:**
- Edge Function використовує Service Role Key всередині для виклику Admin API
- Функція не потребує JWT перевірки, оскільки вона сама авторизована через Service Role Key
- Якщо опція увімкнена, функція буде відхиляти запити з помилкою "Unregistered API key"

## Крок 5: Перевірка змінних оточення

Edge Function автоматично має доступ до:
- `SUPABASE_URL` - URL вашого Supabase проекту
- `SUPABASE_SERVICE_ROLE_KEY` - Service Role Key (автоматично надається)

Ці змінні встановлюються автоматично, додатково налаштовувати не потрібно.

## Крок 6: Тестування

1. Створіть нового користувача через інтерфейс "Управління користувачами"
2. Перевірте, чи прийшов email з запрошенням
3. Перевірте, чи працює кнопка "Надіслати запрошення" для існуючих користувачів

## Troubleshooting

### Помилка "Function not found"
- Перевірте, що функція названа точно `invite-user`
- Перевірте, що функція задеплоєна (статус "Active")

### Помилка "Unregistered API key"
- **Перевірте, що "Verify JWT with legacy secret" ВИМКНЕНО** в налаштуваннях Edge Function
- Переконайтеся, що ви використовуєте правильний `VITE_SUPABASE_ANON_KEY` в змінних оточення
- Перевірте, що Edge Function задеплоєна правильно

### Помилка "Permission denied"
- Перевірте, що Service Role Key налаштований правильно
- Перевірте RLS політики для таблиці `profiles`

### Email не приходить
- Перевірте налаштування Email в Supabase Dashboard → Authentication → Email Templates
- Перевірте, чи не потрапив email в спам
- Перевірте логи Edge Function в Dashboard → Functions → invite-user → Logs

## URL функції

Після деплою функція буде доступна за адресою:
```
https://[your-project-ref].supabase.co/functions/v1/invite-user
```

Цей URL автоматично використовується в коді через `VITE_SUPABASE_URL`.

