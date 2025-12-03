# Виправлення помилки встановлення npm пакетів

## Проблема

Помилки під час встановлення:
- `EBADF: bad file descriptor` - помилка запису файлів
- `EPERM: operation not permitted` - блокування операцій
- `ENOTEMPTY: directory not empty` - проблеми з видаленням директорій

**Причина:** Проєкт знаходиться в Google Drive (`G:\My Drive\!Hero rooms\v3 (1)`), і синхронізація блокує операції npm.

## Рішення (виберіть один з варіантів)

### Варіант 1: Тимчасово призупинити синхронізацію Google Drive (РЕКОМЕНДОВАНО)

1. **Закрийте Google Drive Desktop:**
   - Знайдіть іконку Google Drive в системному треї (правій нижньому куті)
   - Клацніть правою кнопкою → "Quit Google Drive" або "Вийти"

2. **Встановіть пакети:**
   ```bash
   npm install @supabase/supabase-js @supabase/ssr
   ```

3. **Після встановлення** - знову запустіть Google Drive

### Варіант 2: Використати Command Prompt замість PowerShell

1. Відкрийте **Command Prompt** (cmd.exe) як адміністратор
2. Перейдіть до папки проєкту:
   ```cmd
   cd "G:\My Drive\!Hero rooms\v3 (1)"
   ```
3. Встановіть пакети:
   ```cmd
   npm install @supabase/supabase-js @supabase/ssr
   ```

### Варіант 3: Перемістити проєкт з Google Drive

1. Скопіюйте проєкт в інше місце (наприклад, `C:\Projects\v3`)
2. Встановіть пакети там
3. Після встановлення можна повернути проєкт в Google Drive

### Варіант 4: Використати .npmrc для обходу проблем

Створіть файл `.npmrc` в корені проєкту:
```
legacy-peer-deps=true
```

Потім спробуйте встановити знову.

## Перевірка після встановлення

Після успішного встановлення перевірте:

1. **Перевірте package.json** - має містити:
   ```json
   "@supabase/supabase-js": "^2.39.0",
   "@supabase/ssr": "^0.1.0"
   ```

2. **Перевірте node_modules:**
   ```bash
   ls node_modules/@supabase
   ```
   Має містити: `supabase-js`, `ssr`, та інші залежності

3. **Запустіть проєкт:**
   ```bash
   npm run dev
   ```

4. **Перевірте тестову сторінку** - має відкритися `/test-db` з повідомленням про підключення

## Якщо проблема залишається

1. Видаліть `node_modules` та `package-lock.json`
2. Закрийте Google Drive
3. Виконайте:
   ```bash
   npm cache clean --force
   npm install
   ```

