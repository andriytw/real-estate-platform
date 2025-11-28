# Автоматичне встановлення Git та підключення до GitHub
# Запустіть цей скрипт з правами адміністратора

Write-Host "=== Автоматичне встановлення Git та підключення до GitHub ===" -ForegroundColor Green

# Крок 1: Перевірка Git
Write-Host "`n1. Перевірка Git..." -ForegroundColor Yellow
$gitInstalled = $false
try {
    $gitVersion = git --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Git вже встановлений: $gitVersion" -ForegroundColor Green
        $gitInstalled = $true
    }
} catch {
    Write-Host "Git не знайдено, встановлюємо..." -ForegroundColor Yellow
}

# Крок 2: Встановлення Git (якщо потрібно)
if (-not $gitInstalled) {
    Write-Host "`n2. Встановлення Git через winget..." -ForegroundColor Yellow
    winget install --id Git.Git -e --accept-package-agreements --accept-source-agreements --silent
    
    # Очікування завершення встановлення
    Start-Sleep -Seconds 10
    
    # Оновлення PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    
    # Перевірка після встановлення
    $gitPaths = @(
        "C:\Program Files\Git\cmd\git.exe",
        "C:\Program Files (x86)\Git\cmd\git.exe"
    )
    
    foreach ($gitPath in $gitPaths) {
        if (Test-Path $gitPath) {
            $env:Path += ";$(Split-Path $gitPath -Parent)"
            break
        }
    }
}

# Крок 3: Перевірка Git після встановлення
Write-Host "`n3. Перевірка Git..." -ForegroundColor Yellow
try {
    $gitVersion = & "C:\Program Files\Git\cmd\git.exe" --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Git працює: $gitVersion" -ForegroundColor Green
        $gitCmd = "C:\Program Files\Git\cmd\git.exe"
    } else {
        throw "Git не працює"
    }
} catch {
    # Спробувати знайти git в PATH
    $gitCmd = "git"
    try {
        $null = & $gitCmd --version 2>&1
    } catch {
        Write-Host "Помилка: Git не встановлено або не доступний" -ForegroundColor Red
        Write-Host "Будь ласка, встановіть Git вручну: https://git-scm.com/download/win" -ForegroundColor Yellow
        exit 1
    }
}

# Крок 4: Перехід в директорію проекту
Write-Host "`n4. Перехід в директорію проекту..." -ForegroundColor Yellow
$projectPath = "G:\My Drive\!Hero rooms\v3 (1)"
Set-Location $projectPath
Write-Host "Поточна директорія: $(Get-Location)" -ForegroundColor Green

# Крок 5: Ініціалізація Git
Write-Host "`n5. Ініціалізація Git репозиторію..." -ForegroundColor Yellow
& $gitCmd init
if ($LASTEXITCODE -eq 0) {
    Write-Host "Git репозиторій ініціалізовано" -ForegroundColor Green
} else {
    Write-Host "Помилка ініціалізації Git" -ForegroundColor Red
    exit 1
}

# Крок 6: Налаштування Git (потрібно вказати ваші дані)
Write-Host "`n6. Налаштування Git..." -ForegroundColor Yellow
$userName = Read-Host "Введіть ваше ім'я для Git"
$userEmail = Read-Host "Введіть ваш email для Git"

& $gitCmd config user.name $userName
& $gitCmd config user.email $userEmail
Write-Host "Git налаштовано" -ForegroundColor Green

# Крок 7: Додавання файлів
Write-Host "`n7. Додавання файлів до Git..." -ForegroundColor Yellow
& $gitCmd add .
if ($LASTEXITCODE -eq 0) {
    Write-Host "Файли додано" -ForegroundColor Green
} else {
    Write-Host "Помилка додавання файлів" -ForegroundColor Red
    exit 1
}

# Крок 8: Створення commit
Write-Host "`n8. Створення commit..." -ForegroundColor Yellow
& $gitCmd commit -m "Initial commit: Real estate management platform"
if ($LASTEXITCODE -eq 0) {
    Write-Host "Commit створено" -ForegroundColor Green
} else {
    Write-Host "Помилка створення commit" -ForegroundColor Red
    exit 1
}

# Крок 9: Встановлення гілки main
Write-Host "`n9. Встановлення гілки main..." -ForegroundColor Yellow
& $gitCmd branch -M main
Write-Host "Гілка main встановлена" -ForegroundColor Green

Write-Host "`n=== Локальний репозиторій готовий! ===" -ForegroundColor Green
Write-Host "`nДалі потрібно:" -ForegroundColor Yellow
Write-Host "1. Створіть репозиторій на GitHub: https://github.com/new" -ForegroundColor Cyan
Write-Host "2. Виконайте команди:" -ForegroundColor Cyan
Write-Host "   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git" -ForegroundColor White
Write-Host "   git push -u origin main" -ForegroundColor White
Write-Host "3. При автентифікації використайте ваш GitHub токен" -ForegroundColor White

