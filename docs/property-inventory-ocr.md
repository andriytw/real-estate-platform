# Property Inventory OCR — Documentation

Property-only inventory from documents (OCR). Separate from Warehouse: no `warehouse_stock`, `stock_movements`, or warehouse UI. Only Property Card **"Меблі (Інвентар)"** and related DB, service, storage, and UI.

---

## Architecture summary

- **Source of truth:** `property_inventory_items` joined with `property_inventory_documents`. The inventory table is **not** rendered from `properties.inventory` JSON.
- **One document → many items:** Each OCR save creates one row in `property_inventory_documents` and N rows in `property_inventory_items`, each with `document_id` set.
- **Per-row document link:** In the table, column "Документ" shows, for each row:
  - If `document_id` is set and the document has `storage_path`: **Переглянути** / **Скачати** (signed URL to that document).
  - Otherwise (manual row): "—".
- **Append-only:** Adding a second or third invoice adds new document + new items; existing rows are never overwritten.
- **Manual add:** New rows are inserted into `property_inventory_items` with `document_id = null` via `createItem()`; then the list is refreshed from DB.

---

## DB tables

### property_inventory_documents

Stores one row per uploaded document (invoice/file).

| Column          | Type      | Notes |
|-----------------|-----------|--------|
| id              | uuid (PK) | Default `gen_random_uuid()` |
| property_id     | uuid      | FK → `properties(id)` ON DELETE CASCADE |
| storage_path    | text      | Path in bucket `property-inventory-docs` for signed URL |
| file_name       | text      | Original file name |
| file_hash       | text      | Optional; for future dedup |
| invoice_number  | text      | |
| purchase_date   | date      | |
| store           | text      | Магазин |
| ocr_raw         | jsonb     | Optional raw OCR result |
| created_at      | timestamptz | Default `now()` |

- **Indexes:** `(property_id, created_at DESC)`.
- **Unique (optional):** `(property_id, file_hash)` WHERE `file_hash IS NOT NULL` for deduplication.
- **RLS:** Enabled; policies allow authenticated to SELECT, INSERT, UPDATE, DELETE.

### property_inventory_items

One row per inventory line (from OCR or manual).

| Column          | Type      | Notes |
|-----------------|-----------|--------|
| id              | uuid (PK) | Default `gen_random_uuid()` |
| property_id     | uuid      | FK → `properties(id)` ON DELETE CASCADE |
| document_id     | uuid      | FK → `property_inventory_documents(id)` ON DELETE SET NULL; **null** for manual rows |
| article         | text      | Артикул / SKU |
| name            | text      | Назва товару |
| quantity        | numeric   | Default 1 |
| unit_price      | numeric   | |
| invoice_number  | text      | |
| purchase_date   | date      | |
| store           | text      | |
| created_at      | timestamptz | Default `now()` |
| updated_at      | timestamptz | Trigger-updated |

- **Indexes:** `(property_id, created_at DESC)`, `(document_id)`.
- **RLS:** Enabled; authenticated can SELECT, INSERT, UPDATE, DELETE.

---

## Storage

- **Bucket:** `property-inventory-docs` (private).
- **Path convention:** `property/{propertyId}/{documentId}/{safeFileName}`.
- **Policies (on `storage.objects`):**
  - **SELECT** for `authenticated` WHERE `bucket_id = 'property-inventory-docs'`.
  - **INSERT** for `authenticated` WITH CHECK `bucket_id = 'property-inventory-docs'`.
  - **DELETE** (optional) for same bucket.
- **Migration:** `supabase/migrations/20260227140000_create_property_inventory_docs_bucket.sql` — idempotent (bucket ON CONFLICT DO UPDATE; DROP POLICY IF EXISTS before creating policies).
- **Environments:** Run this migration in Dev, Stage, and Prod so uploads work everywhere.

---

## UI flow

### OCR (Add from document)

1. User clicks **"Додати з документа"** on the property inventory tile.
2. Modal opens: preview (left), OCR area (right) with fields **Номер інвойсу**, **Дата покупки**, **Магазин**, and read-only **Об'єкт: {property.title}**.
3. User uploads file → **Recognize with OCR** (same Edge Function as warehouse) → editable table of rows.
4. User edits rows and clicks **Save to inventory**:
   - Validate: file present, at least one valid row (name + quantity > 0).
   - **createDocumentAndUpload(propertyId, file, metadata)** → upload file, insert document row with `storage_path`, return `{ documentId, storage_path }`. On insert failure after upload, service removes the uploaded object (cleanup).
   - **appendItems(propertyId, documentId, rows)** — every item has `document_id = documentId`.
   - **refresh** list via `listItemsWithDocuments(propertyId)`.
   - Close modal and reset form state.
5. On any error (upload, insert, append): show error message and **do not** close the modal.

### Manual add

1. User clicks **Редагувати** then **Додати** (or equivalent) to add a new row in the table.
2. Row is created in local state with temporary id (`new-...`).
3. On **Зберегти**, for each such row the app calls **createItem(propertyId, item)** (which inserts with `document_id = null`).
4. Then **refresh** list from DB.

### Delete

- Delete button on a row calls **deleteItem(itemId)** and then updates the list (filter local or refresh from DB).

### Total

- Sum of `quantity * unit_price` over current rows (from DB).

---

## Error handling / edge cases

- **Upload ok, insert fail:** The uploaded file would be an orphan. The service **createDocumentAndUpload** removes the object from Storage in the catch block (best-effort cleanup), then rethrows. User sees error; modal stays open.
- **Insert ok, appendItems fail:** Document row exists in DB with no items. User sees error; modal stays open. Retry can either call only **appendItems** with the same documentId (if stored in state) or re-run full flow (may create duplicate document without dedup).
- **OCR returned empty:** Save is disabled when there are no valid rows (`validRows.length === 0`). So we never create a document with zero items from this flow.
- **Rollback:** Documented here: on failed insert after upload, the service deletes the uploaded object before rethrowing.

---

## Acceptance checklist (Definition of Done)

- [ ] Inventory on the property tile is rendered **only** from DB: `property_inventory_items` (+ join docs), **not** from `properties.inventory` JSON.
- [ ] Button **"Додати з документа"** opens a modal **1:1 like Warehouse**: preview left, OCR right, editable rows.
- [ ] After Save: file is in Storage (`property-inventory-docs`); one row in `property_inventory_documents` with `storage_path`; N rows in `property_inventory_items`, each with `document_id`.
- [ ] In the inventory table, column **"Документ"** is per-row: OCR rows show **Переглянути** / **Скачати** for that invoice; manual rows show "—".
- [ ] Adding a 2nd/3rd invoice is **append-only** (existing rows remain).
- [ ] **Delete** removes the item from DB and refreshes the list.
- [ ] **Manual add** inserts into `property_inventory_items` with `document_id = null` and list is refreshed after Save.
- [ ] Warehouse, Marketplace, and Ausstattung are **unchanged**.

---

## TODO (short)

- [ ] Ensure bucket migration is applied in all envs (Dev/Stage/Prod).
- [ ] (Optional) Add `file_hash` to documents and unique `(property_id, file_hash)` for dedup.
- [ ] (Optional) Implement `deleteDocument(documentId)` if document removal is needed; items will get `document_id = null` via FK.
- [ ] (Optional) Persist `ocr_raw` in document metadata when calling `createDocumentAndUpload` from OCR flow.
