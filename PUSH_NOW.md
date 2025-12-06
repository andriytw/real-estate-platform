# 🚀 Швидкий Push на GitHub - Інструкція

## 📋 Поточна ситуація:

- ✅ Git налаштовано
- ✅ 3 коміти готові до push
- ⏳ Потрібна автентифікація GitHub

## 🔑 Варіант 1: Personal Access Token (РЕКОМЕНДОВАНО)

### Крок 1: Створіть токен

1. Відкрийте: https://github.com/settings/tokens
2. Натисніть **"Generate new token"** → **"Generate new token (classic)"**
3. Назва: `Real Estate Platform Push`
4. Права: ✅ **`repo`** (повний доступ до репозиторіїв)
5. Натисніть **"Generate token"**
6. **ВАЖЛИВО:** Скопіюйте токен одразу (він показується тільки один раз!)

### Крок 2: Використайте токен

Після того як отримаєте токен, виконайте:

```bash
cd "/Users/andriy/Library/CloudStorage/GoogleDrive-andriy.tw@gmail.com/Мій диск/!Hero rooms/v3 (1)"
git push https://ВАШ_ТОКЕН@github.com/andriytw/real-estate-platform.git main
```

**Замініть `ВАШ_ТОКЕН` на токен, який ви скопіювали!**

## 🖥️ Варіант 2: GitHub Desktop

1. Відкрийте **GitHub Desktop**
2. **File → Add Local Repository**
3. Виберіть папку: `/Users/andriy/Library/CloudStorage/GoogleDrive-andriy.tw@gmail.com/Мій диск/!Hero rooms/v3 (1)`
4. Натисніть **"Publish repository"** або **"Push origin"**

## 🔐 Варіант 3: Credential Helper (якщо токен вже збережено)

```bash
cd "/Users/andriy/Library/CloudStorage/GoogleDrive-andriy.tw@gmail.com/Мій диск/!Hero rooms/v3 (1)"
git push -u origin main
```

Якщо запитає credentials:
- **Username:** `andriytw`
- **Password:** вставте ваш Personal Access Token (НЕ пароль!)

---

**Після успішного push перевірте:** https://github.com/andriytw/real-estate-platform

