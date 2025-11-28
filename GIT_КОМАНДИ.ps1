# Скрипт для підключення до GitHub
# Виконайте ці команди після того, як Git буде доступний

# Перейдіть в директорію проекту
cd "G:\My Drive\!Hero rooms\v3 (1)"

# 1. Ініціалізація Git
Write-Host "1. Ініціалізація Git..." -ForegroundColor Green
git init

# 2. Налаштування Git (замініть на ваші дані)
Write-Host "2. Налаштування Git..." -ForegroundColor Green
git config user.name "Ваше Ім'я"
git config user.email "your.email@example.com"

# 3. Додавання файлів
Write-Host "3. Додавання файлів..." -ForegroundColor Green
git add .

# 4. Перевірка статусу
Write-Host "4. Перевірка статусу..." -ForegroundColor Green
git status

# 5. Створення commit
Write-Host "5. Створення commit..." -ForegroundColor Green
git commit -m "Initial commit: Real estate management platform"

# 6. Встановлення гілки main
Write-Host "6. Встановлення гілки main..." -ForegroundColor Green
git branch -M main

Write-Host "`n✅ Локальний репозиторій готовий!" -ForegroundColor Green
Write-Host "`n📝 ДАЛІ:" -ForegroundColor Yellow
Write-Host "1. Створіть репозиторій на GitHub: https://github.com/new" -ForegroundColor Cyan
Write-Host "2. НЕ додавайте README, .gitignore або license" -ForegroundColor Cyan
Write-Host "3. Після створення виконайте:" -ForegroundColor Cyan
Write-Host "   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git" -ForegroundColor White
Write-Host "   git push -u origin main" -ForegroundColor White
Write-Host "4. При запиті автентифікації:" -ForegroundColor Cyan
Write-Host "   Username: ваш GitHub username" -ForegroundColor White
Write-Host "   Password: ваш GitHub токен (не пароль!)" -ForegroundColor White
Write-Host "   Токен можна знайти на: https://github.com/settings/tokens" -ForegroundColor White

