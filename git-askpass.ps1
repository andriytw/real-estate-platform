# Git askpass script
# Токен потрібно вставити вручну або використати змінну оточення
$token = $env:GITHUB_TOKEN
if (-not $token) {
    Write-Host "Помилка: GITHUB_TOKEN не встановлено" -ForegroundColor Red
    exit 1
}
Write-Output $token

