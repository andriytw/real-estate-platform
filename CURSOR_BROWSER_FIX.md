# Виправлення проблеми з браузером Cursor

## Проблема
В браузері Cursor крутиться зелений кружок "Loading", хоча в звичайному браузері все працює.

## Рішення

### Варіант 1: Автоматичне очищення (вже додано)
Код автоматично очищає кеш при завантаженні сторінки.

### Варіант 2: Ручне очищення кешу

1. **Відкрийте консоль браузера Cursor:**
   - Натисніть `F12` або `Cmd+Option+I` (Mac) / `Ctrl+Shift+I` (Windows)
   - Перейдіть на вкладку "Console"

2. **Виконайте команду для очищення кешу:**
   ```javascript
   localStorage.clear();
   sessionStorage.clear();
   location.reload();
   ```

3. **Або очистіть тільки Supabase кеш:**
   ```javascript
   Object.keys(localStorage).forEach(key => {
     if (key.includes('supabase') || key.includes('sb-') || key.includes('auth')) {
       localStorage.removeItem(key);
     }
   });
   Object.keys(sessionStorage).forEach(key => {
     if (key.includes('supabase') || key.includes('sb-') || key.includes('auth')) {
       sessionStorage.removeItem(key);
     }
   });
   location.reload();
   ```

### Варіант 3: Використовуйте звичайний браузер
Якщо проблема залишається, використовуйте Chrome/Safari/Firefox:
- Відкрийте `http://localhost:3000` в звичайному браузері
- Там все працює правильно

### Варіант 4: Перезапуск dev сервера
```bash
# Зупиніть сервер (Ctrl+C)
# Потім запустіть знову:
npm run dev
```

## Що було зроблено

1. ✅ Додано автоматичне очищення кешу в `index.html`
2. ✅ Додано перевірку завантаження в `App.tsx`
3. ✅ Виправлено імпорти в `SalesChat.tsx`
4. ✅ Змінено початковий view на `'dashboard'`

## Якщо проблема залишається

1. Перевірте консоль браузера на наявність помилок
2. Перевірте Network tab - чи завантажуються файли
3. Спробуйте відкрити сайт в режимі інкогніто
4. Перезапустіть Cursor


