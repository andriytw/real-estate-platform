# TECHNICAL AUDIT — Deposit docs persistence (DB + Storage) + UI wiring

**Goal:** Confirm that "deposit payment proof" and "deposit return proof" documents are stored persistently, survive reload/session, and are correctly used by the 2-row Deposit UI.

---

## A) DB

### 1) Exact table name used by the UI

**`public.property_documents`**

The UI uses `propertyDocumentsService`, which queries this table (see `services/supabaseService.ts`).

### 2) Table schema and how doc types are stored

**Schema** (from `supabase/migration_property_documents.sql`):

| Column       | Type         | Notes                          |
|-------------|--------------|---------------------------------|
| id          | UUID         | PRIMARY KEY, default gen_random_uuid() |
| property_id | UUID         | NOT NULL, REFERENCES properties(id) ON DELETE CASCADE |
| type        | TEXT         | NOT NULL — doc type stored here |
| file_path   | TEXT         | NOT NULL — path in storage bucket |
| title       | TEXT         | nullable                       |
| doc_date    | DATE         | nullable                       |
| notes       | TEXT         | nullable                       |
| created_at  | TIMESTAMPTZ  | NOT NULL DEFAULT now()         |

**Doc type values:** Stored in column `type` (not `doc_type`). For deposit docs the values are:

- `deposit_payment_proof`
- `deposit_return_proof`

(Defined in `types.ts` as `PropertyDocumentType` and written as-is by `createPropertyDocument`.)

### 3) Exact query used in AccountDashboard to fetch docs

**File:** `components/AccountDashboard.tsx`  
**Where:** `useEffect` that runs when `selectedPropertyId` changes (around lines 2109–2125).

**Function used:** `propertyDocumentsService.listPropertyDocuments(selectedPropertyId)`.

**Implementation** (`services/supabaseService.ts`, `propertyDocumentsService.listPropertyDocuments`):

```ts
const { data, error } = await supabase
  .from('property_documents')
  .select('id, property_id, type, file_path, title, doc_date, notes, created_at')
  .eq('property_id', propertyId)
  .order('created_at', { ascending: false });
```

Result is mapped via `transformPropertyDocumentFromDB` (snake_case → camelCase). Fetched list is stored in state `card1Documents` via `setCard1Documents`.

### 4) Does the table exist in migrations?

**Yes.** The table is created in `supabase/migration_property_documents.sql` with `CREATE TABLE IF NOT EXISTS public.property_documents (...)` and RLS policies (SELECT, INSERT, DELETE) scoped to properties the user can access. There is no UPDATE policy; the UI does not update rows (replace = new row + new file).

---

## B) Storage

### 1) Bucket used for these docs

**Bucket name:** `property-docs`  
(Constant `PROPERTY_DOCS_BUCKET = 'property-docs'` in `services/supabaseService.ts` line 2408.)

### 2) File path convention

**Convention:** `properties/{propertyId}/{type}/{docId}_{safeFileName}`

**Example:**  
`properties/a1b2c3d4-e5f6-7890-abcd-ef1234567890/deposit_payment_proof/550e8400-e29b-41d4-a716-446655440000_receipt.pdf`

- `propertyId` = UUID of the property  
- `type` = document type (e.g. `deposit_payment_proof`, `deposit_return_proof`)  
- `docId` = UUID used both as row `id` and in the path (avoids orphans)  
- `safeFileName` = original file name with `/` and `\` replaced by `_`

Defined in `services/supabaseService.ts`, `uploadPropertyDocumentFile` (lines 2504–2505):

```ts
const safeName = file.name.replace(/[/\\]/g, '_');
const filePath = `properties/${propertyId}/${type}/${docId}_${safeName}`;
```

### 3) Where upload is implemented

**File:** `services/supabaseService.ts`  
**Function:** `propertyDocumentsService.uploadPropertyDocumentFile(file, propertyId, type, docId)`  
**What it does:** Uploads `file` to bucket `property-docs` at the path above; returns the storage path. Does not insert the DB row (caller does that).

**Called from UI:** `components/AccountDashboard.tsx`, in the “add document” form submit handler (around line 4347): it calls `uploadPropertyDocumentFile`, then `createPropertyDocument`, then `listPropertyDocuments` and `setCard1Documents`.

### 4) Where signed URL generation is implemented

**File:** `services/supabaseService.ts`  
**Function:** `propertyDocumentsService.getDocumentSignedUrl(filePath, expirySeconds?)`  
**Default expiry:** 3600 seconds (1 hour).  
**What it does:** Calls `supabase.storage.from(PROPERTY_DOCS_BUCKET).createSignedUrl(filePath, expirySeconds)` and returns the signed URL.

---

## C) UI wiring (Deposit 2-row grid)

### 1) Doc types per row

- **Row 1 (payment):** `doc_type` = `deposit_payment_proof`  
  (UI filters: `card1Documents.find(d => d.type === 'deposit_payment_proof')`.)

- **Row 2 (return):** `doc_type` = `deposit_return_proof`  
  (UI filters: `card1Documents.find(d => d.type === 'deposit_return_proof')`.)

### 2) Icon actions and persistence

- **Add / Replace**
  - **Action:** `setNewDocType('deposit_payment_proof' | 'deposit_return_proof')` and `setShowAddDocumentForm(true)`.
  - **Form submit:** Uses existing “add document” flow: `uploadPropertyDocumentFile` → `createPropertyDocument` → `listPropertyDocuments(selectedProperty.id)` → `setCard1Documents(list)`.
  - **Conclusion:** Yes — form uploads to storage and inserts a DB row; list is refetched and state updated.

- **View**
  - **Action:** `propertyDocumentsService.getDocumentSignedUrl(doc.filePath)` then `window.open(url, '_blank')`.
  - **Conclusion:** Yes — uses real signed URL from storage.

- **Delete**
  - **Action:** `propertyDocumentsService.deletePropertyDocumentHard(doc)` then `listPropertyDocuments(pid).then(setCard1Documents)`.
  - **Implementation of delete:** 1) `supabase.storage.from(PROPERTY_DOCS_BUCKET).remove([doc.filePath])`, 2) `supabase.from('property_documents').delete().eq('id', doc.id)`.
  - **Conclusion:** Yes — deletes both the storage object and the DB row; then refetches and updates UI.

---

## D) Persistence proof (reproducible manual test)

1. **Payment proof**
   - Open a property, Card 1, switch to “Редагувати”.
   - In the Deposit (Застава) section, Row 1, click the “add document” (Plus) icon.
   - Choose type “Підтвердження оплати застави” (or ensure type is `deposit_payment_proof`), attach a file, save.
   - Reload the page (F5 or new tab, same property).
   - Open Card 1 again (edit or view). Row 1 “View” icon should be enabled; clicking it should open the same document. List in “Документи та договори” should still show the payment proof.

2. **Return proof**
   - Same flow in Row 2: add document for “Підтвердження повернення застави” (`deposit_return_proof`), save.
   - Reload the page.
   - Row 2 “View” should be enabled and open the uploaded file; “Документи та договори” should list the return proof.

If both steps work after reload, persistence (DB + storage) and UI wiring are confirmed.

---

## E) If anything is missing

### 1) Storage bucket `property-docs` not created by migrations

- **Current state:** `migration_property_documents.sql` only states: *“Create Supabase Storage bucket ‘property-docs’ manually in Dashboard (private) or via CLI”*. No migration creates this bucket.
- **Risk:** If the bucket does not exist, `uploadPropertyDocumentFile` and `getDocumentSignedUrl` will fail; docs will not persist.
- **Minimal fix:** Ensure the bucket exists (Supabase Dashboard → Storage → create bucket `property-docs`, private). Optionally add a small migration that creates the bucket (e.g. `INSERT INTO storage.buckets (...)`) and, if the bucket is private, storage policies for `storage.objects` for bucket `property-docs` (SELECT/INSERT/DELETE for the same roles that can access `property_documents`), similar to `migration_storage_payment_proofs.sql` / `migration_storage_payment_proofs_private.sql`. **Files to add/touch:** one new migration (e.g. `supabase/migration_storage_property_docs.sql`) — no refactors, no changes to sales/calendar/reservations.

### 2) No UPDATE policy on `property_documents`

- Not required for current behavior: “Replace” in the UI is implemented as “add new document” (and optionally delete the old one manually). No UPDATE is used.

### 3) Summary

- **DB:** Table exists in migrations; schema and doc types are correct; fetch query and state wiring are correct.
- **Storage:** Bucket name and path convention are defined in code; upload and signed URL are implemented and used. The only potential gap is that the **bucket may not exist** and **storage RLS for `property-docs`** is not defined in migrations. If the bucket was created manually and is public, persistence can already work; if it is private, storage policies are needed for signed URLs and uploads to succeed.

**Minimal required changes to make persistence guaranteed and migration-driven:**

- Add a migration that creates the `property-docs` bucket (and, if private, storage policies for that bucket). No other file changes required for deposit doc persistence.
