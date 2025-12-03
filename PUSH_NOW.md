# 🚀 Відправити на GitHub - ПРОСТИЙ СПОСІБ

## ✅ Commit вже готовий!

Всі зміни закомічені. Тепер потрібно відправити на GitHub.

## 📱 Варіант 1: GitHub Desktop (НАЙПРОСТІШЕ)

1. Відкрийте **GitHub Desktop**
2. Ви побачите commit: "Add Supabase integration..."
3. Натисніть кнопку **Push origin** (вгорі справа)
4. Готово! ✅

## 💻 Варіант 2: Термінал з токеном

Якщо у вас є GitHub Personal Access Token:

```bash
git push https://YOUR_TOKEN@github.com/andriytw/real-estate-platform.git main
```

Або налаштуйте credential helper:

```bash
git config --global credential.helper osxkeychain
git push origin main
```

(Потім введіть username та token коли попросить)

## 🌐 Варіант 3: Через GitHub веб-інтерфейс

1. Відкрийте: https://github.com/andriytw/real-estate-platform
2. Перейдіть в **Upload files**
3. Але краще використати GitHub Desktop

## ⚡ Після push:

Vercel автоматично почне деплой! 

**Не забудьте:**
- Додати environment variables в Vercel (див. QUICK_VERCEL_SETUP.txt)
- Створити таблиці в Supabase (SQL Editor → supabase/schema.sql)

