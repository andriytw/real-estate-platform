# 🚀 Інструкції для публікації на GitHub

## ✅ Що вже зроблено:

1. ✅ Git репозиторій ініціалізовано
2. ✅ Створено коміт з версією v3.0.0
3. ✅ GitHub remote налаштовано: `https://github.com/andriytw/real-estate-platform.git`
4. ✅ Гілка `main` встановлена

## 📤 Як запушити на GitHub:

### Варіант 1: Через GitHub Personal Access Token (рекомендовано)

1. **Створіть Personal Access Token:**
   - Перейдіть на: https://github.com/settings/tokens
   - Натисніть "Generate new token" → "Generate new token (classic)"
   - Назва: "Real Estate Platform"
   - Права: `repo` (повний доступ до репозиторіїв)
   - Натисніть "Generate token"
   - **ВАЖЛИВО:** Скопіюйте токен (він показується тільки один раз!)

2. **Використайте токен для push:**
   ```bash
   cd "/Users/andriy/Library/CloudStorage/GoogleDrive-andriy.tw@gmail.com/Мій диск/!Hero rooms/v3 (1)"
   
   # Замініть YOUR_TOKEN на ваш токен
   git push https://YOUR_TOKEN@github.com/andriytw/real-estate-platform.git main
   ```

   АБО збережіть токен в credential helper:
   ```bash
   git config --global credential.helper store
   git push -u origin main
   # Коли запитає username: введіть ваш GitHub username
   # Коли запитає password: введіть ваш Personal Access Token (НЕ пароль!)
   ```

### Варіант 2: Через SSH (якщо налаштовано)

1. **Перевірте, чи є SSH ключ:**
   ```bash
   ls -la ~/.ssh/id_*.pub
   ```

2. **Якщо немає SSH ключа, створіть:**
   ```bash
   ssh-keygen -t ed25519 -C "andriy.tw@gmail.com"
   # Натисніть Enter для всіх питань
   ```

3. **Додайте SSH ключ на GitHub:**
   ```bash
   cat ~/.ssh/id_ed25519.pub
   # Скопіюйте вивід
   ```
   - Перейдіть на: https://github.com/settings/keys
   - Натисніть "New SSH key"
   - Вставте ключ та збережіть

4. **Змініть remote на SSH:**
   ```bash
   git remote set-url origin git@github.com:andriytw/real-estate-platform.git
   git push -u origin main
   ```

### Варіант 3: Через GitHub Desktop

1. Відкрийте GitHub Desktop
2. File → Add Local Repository
3. Виберіть папку проекту
4. Натисніть "Publish repository" або "Push origin"

## 🔍 Перевірка після push:

```bash
git log --oneline -5
git remote -v
```

Перевірте на GitHub: https://github.com/andriytw/real-estate-platform

## ⚠️ Якщо виникли проблеми:

1. **"Permission denied":**
   - Перевірте, чи токен має права `repo`
   - Перевірте, чи репозиторій існує на GitHub

2. **"Repository not found":**
   - Створіть репозиторій на GitHub вручну:
     - Перейдіть на: https://github.com/new
     - Назва: `real-estate-platform`
     - Public або Private
     - НЕ додавайте README, .gitignore, license

3. **"Authentication failed":**
   - Перевірте правильність токену
   - Спробуйте створити новий токен

## 📝 Після успішного push:

1. Перевірте на GitHub, що файли завантажилися
2. Налаштуйте Vercel для автоматичного деплою
3. Додайте environment variables в Vercel

---

**Останнє оновлення:** 2025-01-XX


