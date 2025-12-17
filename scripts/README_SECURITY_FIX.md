# Виправлення попереджень Security Advisor в Supabase

## Автоматичне виконання (через Supabase SQL Editor)

1. Відкрийте Supabase Dashboard
2. Перейдіть до **SQL Editor**
3. Відкрийте файл `supabase/fix_security_advisor_warnings.sql`
4. Скопіюйте весь вміст файлу
5. Вставте в SQL Editor
6. Натисніть **Run** (⌘↵ або Ctrl+Enter)

## Що виправляє скрипт:

### 1. Function Search Path Mutable (6 попереджень)
- Додає `SET search_path = ''` до всіх функцій:
  - `user_role()`
  - `user_department()`
  - `handle_new_user()`
  - `update_updated_at_column()`
  - `update_chat_room_last_message()`

### 2. Multiple Permissive Policies (38 попереджень)
- Об'єднує дубльовані політики для таблиць:
  - `profiles` - об'єднує 4 політики в 2
  - `task_workflows` - об'єднує 3 політики в 3 (з перевіркою існування)
  - `user_invitations` - об'єднує всі політики (якщо таблиця існує)

### 3. Leaked Password Protection
- **Потрібно увімкнути вручну:**
  1. Перейдіть до **Authentication** → **Settings**
  2. Знайдіть **"Leaked Password Protection"**
  3. Увімкніть опцію

## Перевірка після виконання

Після виконання скрипту перевірте Security Advisor:
- Function Search Path Mutable: має бути **0 warnings**
- Multiple Permissive Policies: має значно зменшитися
- Leaked Password Protection: увімкніть вручну

## Якщо виникають помилки

Якщо виникає помилка про відсутність колонки `worker_id` в `task_workflows`:
1. Спочатку виконайте перевірку структури (останні SELECT в скрипті)
2. Перевірте, чи таблиця `task_workflows` існує
3. Якщо таблиця не існує, виконайте `supabase/migration_kanban_final.sql` спочатку


