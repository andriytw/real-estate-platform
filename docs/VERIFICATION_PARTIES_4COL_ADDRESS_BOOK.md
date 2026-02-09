# Звіт верифікації: Parties 4 колонки + Address Book

## 1. Parties block — 4 колонки

- **EDIT:** сітка `md:grid-cols-4`, заголовки: «Власник (орендодавець)», «1-ша фірма», «2-га фірма», «Управління».
- **VIEW:** ті самі 4 колонки з тими самими заголовками.

Існуючі поля не видалялися; додано лише:

- **Owner (landlord):** `landlord.unitIdentifier` (Ідентифікатор квартири (Власник)), `landlord.contactPerson` (Контактна персона).
- **Management:** `management.unitIdentifier` (Ідентифікатор квартири (Управління)), `management.contactPerson` (Контактна персона).
- **SecondCompany:** повний набір полів як у tenant (назва, IBAN, адреса, телефони, email, День оплати (1–31) select).
- **Payment day:** select «—» + 1..31 для tenant і secondCompany, значення в `paymentDayOfMonth`.

---

## 2. property.code і unitIdentifier — немає перетину

- Пошук по **property.code**: у коді немає використання `property.code`; збіги лише `error?.code`, `fetchError.code` тощо.
- Пошук по **unitIdentifier**: використовується тільки як `landlord.unitIdentifier`, `management.unitIdentifier` (з property/картки), та в типах/Address Book (`ContactParty.unitIdentifier`, `AddressBookPartyEntry.unitIdentifier`).
- У `types.ts` у коментарі до `ContactParty.unitIdentifier` явно: «DO NOT use property.code».

**Висновок:** для owner/management unitIdentifier використовуються лише `landlord.unitIdentifier` та `management.unitIdentifier`; **property.code для unitIdentifier не використовується — перетину немає.**

---

## 3. Persistence

- **Міграція:** `supabase/migrations/20260223120000_add_second_company_to_properties.sql` — додає `second_company` JSONB і коментар.
- **transformPropertyFromDB:** `secondCompany: db.second_company ?? undefined`.
- **transformPropertyToDB:** `if (property.secondCompany !== undefined) result.second_company = property.secondCompany`.
- **propertiesService:** при повному завантаженні використовується `select('*')` (getAll без lightweight, getById, update), тому `second_company` потрапляє в відповідь.

---

## 4. Address Book

- Записи формуються в `propertyToPartiesAddressBookEntries()` з полів property (landlord, tenant, secondCompany, management) і зберігаються лише через `addressBookPartiesService.upsertMany(entries)`.
- `addressBookPartiesService` працює тільки з таблицею `address_book_parties` (`.from('address_book_parties')` для listByRole і upsert). Змішування з sales/leads/іншими сутностями відсутнє.

---

## 5. Блок «Актуальний орендар»

- Один TODO-коментар (без інших змін): перейменування «Актуальний Орендар» → «Актуальний Клієнт» і від’єднання від Parties (майбутня задача). Сам блок не змінювався.

---

## 6. Lint і скрипти репо

У репо **немає скрипта lint**: в `package.json` є лише `dev`, `build`, `preview`. Тому **lint не запускали**. Інфраструктуру репо не змінювали.

---

## 7. TypeScript і збірка

- **`npx tsc --noEmit`** падає через **існуючі** помилки в інших файлах (App.tsx, types.ts, KanbanBoard, supabase functions тощо). Помилок у файлах Parties block та Address Book (AccountDashboard — блок Card 1, supabaseService — transform, address_book_parties, propertyToPartiesAddressBookEntries) немає.
- **Команда, яку реально можна виконати в репо:** `npm run build`. Вона проходить успішно (Vite збирає проєкт).

---

## 8. Smoke test (мінімум)

Підтвердження, що Parties block і Address Book коректно працюють у UI:

1. **a)** Відкрити property → Card 1 → Редагувати → заповнити усі 4 колонки (Власник, 1-ша фірма, 2-га фірма, Управління), включно з unitIdentifier/contactPerson та payment day для обох фірм → **Зберегти**.
2. **b)** Оновити сторінку (refresh) → перевірити, що **secondCompany** та **payment days** (1-ша та 2-га фірма) збереглися і відображаються у VIEW.
3. **c)** Натиснути **«Address Book»** → у модалці мають з’явитися записи після Save (owner, company1, company2, management — за наявності заповнених назв).

Ці кроки виконуються вручну в браузері після `npm run dev` або на розгорнутому build.
