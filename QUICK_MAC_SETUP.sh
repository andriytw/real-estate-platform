#!/bin/bash

# Швидкий скрипт налаштування проєкту на MacBook
# Використання: chmod +x QUICK_MAC_SETUP.sh && ./QUICK_MAC_SETUP.sh

echo "🚀 Початок налаштування проєкту на MacBook..."

# Перевірка Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js не встановлено!"
    echo "📦 Встановлюю Node.js через Homebrew..."
    if ! command -v brew &> /dev/null; then
        echo "❌ Homebrew не встановлено. Будь ласка, встановіть Node.js вручну з https://nodejs.org/"
        exit 1
    fi
    brew install node
else
    echo "✅ Node.js встановлено: $(node --version)"
fi

# Перевірка npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm не встановлено!"
    exit 1
else
    echo "✅ npm встановлено: $(npm --version)"
fi

# Перевірка наявності package.json
if [ ! -f "package.json" ]; then
    echo "❌ Файл package.json не знайдено!"
    echo "Переконайтеся, що ви знаходитесь в корені проєкту."
    exit 1
fi

# Перевірка .env.local
if [ ! -f ".env.local" ]; then
    echo "⚠️  Файл .env.local не знайдено!"
    echo "Створюю шаблон .env.local..."
    cat > .env.local << EOF
NEXT_PUBLIC_SUPABASE_URL=https://qcpuzfhawcondygspiok.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_cpQrhzVqZRCCeULDWhVJJw_ZIhcLx0Y
EOF
    echo "✅ Створено .env.local. Будь ласка, перевірте значення!"
else
    echo "✅ Файл .env.local знайдено"
fi

# Очищення та встановлення залежностей
echo "🧹 Очищення старого node_modules..."
rm -rf node_modules package-lock.json

echo "📦 Встановлення залежностей..."
npm install

if [ $? -eq 0 ]; then
    echo "✅ Залежності встановлено успішно!"
    echo ""
    echo "🎉 Налаштування завершено!"
    echo ""
    echo "Наступні кроки:"
    echo "1. Запустіть проєкт: npm run dev"
    echo "2. Відкрийте браузер: http://localhost:5173"
    echo "3. Перевірте підключення до Supabase: /test-db"
else
    echo "❌ Помилка під час встановлення залежностей!"
    echo "Спробуйте вручну: npm install"
    exit 1
fi

