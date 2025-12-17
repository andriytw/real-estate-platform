#!/bin/bash

# Скрипт для push на GitHub з токеном
# Використання: ./push_to_github.sh [YOUR_TOKEN]
# Якщо токен не вказано, спробує використати збережений в keychain

cd "/Users/andriy/Library/CloudStorage/GoogleDrive-andriy.tw@gmail.com/Мій диск/!Hero rooms/v3 (1)"

if [ -z "$1" ]; then
  echo "ℹ️  Токен не вказано, спробую використати збережений..."
  echo "🚀 Запускаю push на GitHub..."
  echo ""
  git push origin main
else
  TOKEN=$1
  echo "🚀 Запускаю push на GitHub з токеном..."
  echo ""
  # Push з токеном в URL
  git push https://${TOKEN}@github.com/andriytw/real-estate-platform.git main
fi

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Успішно запушено на GitHub!"
  echo "📦 Vercel автоматично задеплоїть нову версію за кілька хвилин"
  echo "🌐 Перевірте: https://github.com/andriytw/real-estate-platform"
else
  echo ""
  echo "❌ Помилка при push. Перевірте токен та спробуйте ще раз."
  exit 1
fi

