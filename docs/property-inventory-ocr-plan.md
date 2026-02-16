# Property Inventory OCR — FULL Implementation Plan (end-to-end)

**Scope (strict):** Do NOT touch Marketplace, Warehouse inventory logic/data/UI, or Ausstattung. Only Property Card "Меблі (Інвентар)" + property inventory DB/service/storage/UI.

---

## 0) Definition of Done (Acceptance)

- Інвентар на плитці квартири рендериться **тільки з DB**: `property_inventory_items` (+ join docs), **не** з `properties.inventory` JSON.
- Кнопка **"Додати з документа"** відкриває модальне вікно **1:1 як у складі**: preview зліва, OCR справа, editable rows.
- Після Save:
  - файл лежить у Storage (bucket `property-inventory-docs`);
  - є рядок у `property_inventory_documents` зі `storage_path`;
  - N рядків у `property_inventory_items`, кожен має `document_id`.
- У таблиці інвентарю колонка **"Документ"** — **per-row**:
  - OCR-рядки → "Переглянути" / "Скачати" відкривають **саме той** інвойс;
  - ручні рядки → "—".
- Додав 2-й/3-й інвойс → **append-only** (старі рядки не зникають і не перезаписуються).
- **Delete** видаляє item з DB і одразу оновлює UI (refresh list).
- Warehouse / Marketplace / Ausstattung **не змінені**.

---

## 1) Data Model (DB)

- ✅ **Уже є:** таблиці `property_inventory_documents` (з `storage_path`), `property_inventory_items` з `document_id` (nullable) + FK; RLS увімкнено.  
  Файли: `supabase/migrations/20260227120000_create_property_inventory_ocr_tables.sql`, `supabase/migrations/20260227130000_add_storage_path_to_property_inventory_documents.sql`.

- 🔲 **Перевірити/додати (якщо ще не зроблено):**
  - Індекси: `(property_id, created_at DESC)` на обох таблицях; `(document_id)` на `property_inventory_items` — у початковій міграції вже є, переконатись.
  - **file_hash** у `property_inventory_documents` + **unique(property_id, file_hash) WHERE file_hash IS NOT NULL** (для дедупу документів) — опційно, але бажано.

---

## 2) Storage bucket + policies (Prod / Stage / Dev)

- 🔲 **Залишилось:** без цього в проді upload може "мовчки" не працювати.

  - **Міграція:** створити bucket `property-inventory-docs` (private, file_size_limit, allowed_mime_types: pdf, images).
  - **Storage policies:**
    - **SELECT (read)** для `authenticated` по `bucket_id = 'property-inventory-docs'`;
    - **INSERT (upload)** для `authenticated` по тому ж bucket;
    - (опційно) **DELETE** — якщо колись потрібно видаляти файли документів.
  - **Обовʼязково:** міграція має бути **ідемпотентною** (`ON CONFLICT (id) DO UPDATE` для bucket), щоб повторний запуск не ламався.
  - Bucket/policies мають бути застосовані в **кожному env** (Dev/Stage/Prod).

---

## 3) Service layer (single source of truth)

- ✅ **Уже є:** `services/propertyInventoryService.ts` — `listItemsWithDocuments(propertyId)`, `createDocument`, `uploadDocumentFile`, `getDocumentSignedUrl`, `appendItems`, `deleteItem`.

- 🔲 **Рекомендовано додати (надійність і консистентність):**

  - **3.1 createDocumentAndUpload(propertyId, file, metadata)** — atomic-ish flow:
    - Генерувати `documentId` на клієнті (uuid).
    - Будувати `storage_path = property/${propertyId}/${documentId}/${safeFileName}`.
    - **Upload file** → потім **insert** document row з цим `storage_path`.
    - Return `{ documentId, storage_path }`.
    - **Якщо insert впав після upload** → залишається orphan file. Прийнятно; опційно:
      - 🔲 **Cleanup:** якщо insert не вдався — видалити щойно завантажений object з Storage (rollback), щоб не копитися orphan-файлам.

  - **3.2 deleteDocument(documentId)** — опційно:
    - Якщо колись видаляєш документ: items з FK `ON DELETE SET NULL` стануть "manual" (колонка Документ = "—").
    - Можна не реалізовувати зараз; достатньо мати в плані/доках.

---

## 4) UI: Property Card "Меблі (Інвентар)"

- ✅ **Уже зроблено:**
  - Таблиця бере дані з `property_inventory_items` (join docs) через `listItemsWithDocuments(propertyId)`.
  - Колонки як у складу + "Документ" (per-row Переглянути/Скачати або "—").
  - Delete → `deleteItem(itemId)` + оновлення списку (filter local або refresh).
  - Total = `sum(quantity * unit_price)` по рядках з DB.

- 🔲 **Перевірити/додати обовʼязково:**

  - **4.1 Manual add → обовʼязково пишеться в DB.**  
    План явно фіксує: ручне додавання — не тільки в state, а:
    - **insert** в `property_inventory_items` з `document_id = null`;
    - **refresh** list (або оптимістичний append з результатом insert).  
    Переконатись, що в коді використовується `createItem` (або еквівалент) і після нього викликається `refreshPropertyInventory()` / оновлення стану.

  - **4.2 Колонка "Документ" — UX:**
    - Показувати короткий підпис: **invoice_number** або **file_name** (вже є в поточній реалізації).
    - Signed URL expiry (наприклад 60 хв) — прийнятно.
    - Download через `<a download={file_name}>` + programmatic click — вже є.

---

## 5) Property OCR modal (як склад, але для квартири)

- ✅ **Уже є:** layout як warehouse (preview зліва, OCR справа), OCR + editable rows, Save викликає upload → createDocument → appendItems → refresh.

- 🔲 **Залишилось:**
  - Поле **Магазин (store)** в модалці — input, привʼязаний до `propertyOcrVendor`, щоб зберігати в documents/items.
  - Read-only **"Об'єкт: {selectedProperty?.title}"** — щоб було очевидно, куди пишемо (без warehouse selector).

- 🔲 **Save flow — чітко зафіксований порядок:**
  1. Validate: file + rows (name, quantity > 0).
  2. **createDocumentAndUpload(propertyId, file, metadata)** → отримати `documentId`, `storage_path`.
  3. **appendItems(propertyId, documentId, rows)** — у **кожного** item обовʼязково `document_id = documentId`.
  4. **refresh** list (`listItemsWithDocuments`), close modal, clear form state.
  - При помилці на крокі 2 або 3: показати повідомлення, **не** закривати modal (користувач може повторити або змінити дані). Опційно: якщо помилка після upload (крок 2 insert fail) — викликати cleanup orphan file (якщо реалізовано в сервісі).

---

## 6) Error handling / edge cases

- **Upload ok, insert fail:** залишається orphan file у Storage. Опційно: cleanup (видалити object) у catch після невдалого insert.
- **Insert ok, appendItems fail:** документ є в DB без items. Можна показати помилку і залишити modal відкритим; при повторному Save потрібно або тільки appendItems(documentId, rows), або весь flow з нуля (тоді буде дубль документу без дедупу). Бажано: при помилці appendItems не робити повторний createDocument — лише retry appendItems або ручне додавання items пізніше (out of scope для мінімуму).
- **OCR повернув пусто:** не блокувати Save; якщо є хоча б один ручний рядок — можна зберігати документ без items або не дозволяти Save без рядків (поточна логіка — validRows.length > 0).
- **Rollback:** явно описати в доках: при невдалому insert після upload — опційний delete object у Storage.

---

## 7) Documentation

- 🔲 **Додати** `docs/property-inventory-ocr.md` з обовʼязковими секціями:

  - **Architecture summary:** property-only; джерело даних — `property_inventory_items` + join `property_inventory_documents`; один документ → багато items; per-row Документ (Переглянути/Скачати) або "—".
  - **DB tables:** опис колонок обох таблиць, FK, індекси, RLS; опційно file_hash + unique для дедупу.
  - **Storage:** bucket `property-inventory-docs`, path `property/{propertyId}/{documentId}/{safeFileName}`, policies (SELECT, INSERT, опційно DELETE).
  - **UI flow:** кнопка "Додати з документа" → modal → Recognize → edit rows → Save (createDocumentAndUpload → appendItems → refresh + close). Manual add → insert item з document_id = null → refresh.
  - **Error handling / edge cases:** upload ok / insert fail; insert ok / appendItems fail; OCR пусто; orphan files і опційний cleanup (зв. п. 6).
  - **Migration order / environments:** bucket і policies мають бути в кожному env (міграція в репо застосовується на всіх env).
  - **TODO list (коротко):** що робити далі (наприклад: file_hash dedup, deleteDocument, cleanup orphan, ocr_raw persistence).
  - **Acceptance checklist (Definition of Done):** перелік з п. 0 як фінальний чеклист для прийомки.

---

## 8) Підсумок: що вже зроблено vs залишилось

| Блок | ✅ Вже зроблено | 🔲 Залишилось |
|------|------------------|----------------|
| **DoD** | — | Використовувати секцію 0 як Acceptance / Definition of Done. |
| **DB** | Tables + storage_path + RLS; індекси в міграції. | Перевірити індекси; опційно file_hash + unique(property_id, file_hash). |
| **Storage** | — | Міграція: bucket `property-inventory-docs` + SELECT/INSERT (optional DELETE), idempotent; застосувати в усіх env. |
| **Service** | listItemsWithDocuments, createDocument, uploadDocumentFile, getDocumentSignedUrl, appendItems, deleteItem. | createDocumentAndUpload; опційно cleanup при insert fail; опційно deleteDocument. |
| **UI table** | Дані з DB, колонка Документ (per-row), delete → deleteItem, total з рядків. | Підтвердити: manual add = insert у `property_inventory_items` (document_id=null) + refresh. |
| **OCR modal** | Layout як warehouse, OCR, editable rows, Save: upload → doc → items → refresh. | Store (Магазин) input; read-only "Об'єкт: {property.title}"; чіткий порядок Save (validate → createDocumentAndUpload → appendItems → refresh + close). |
| **Docs** | — | Файл property-inventory-ocr.md: architecture, DB, storage, UI flow, edge cases, migration order/envs, TODO, acceptance checklist. |

---

## Summary of deliverables (action list)

1. **Storage migration:** створити bucket `property-inventory-docs` + policies (SELECT, INSERT, optional DELETE), ідемпотентно.
2. **Service:** додати `createDocumentAndUpload`; опційно — cleanup orphan file при невдалому insert.
3. **Property OCR modal:** додати поле Магазин (store) і read-only "Об'єкт: {property.title}"; зафіксувати Save flow (validate → createDocumentAndUpload → appendItems → refresh + close).
4. **Manual add:** переконатись, що реалізовано через insert у `property_inventory_items` з `document_id = null` та refresh (не тільки local state).
5. **Docs:** створити `docs/property-inventory-ocr.md` з усіма секціями з п. 7, включно з error handling, migration order і acceptance checklist.

Усе в межах scope: лише Property Card "Меблі (Інвентар)" та повʼязані DB/service/storage/UI; Warehouse, Marketplace, Ausstattung не чіпати.
