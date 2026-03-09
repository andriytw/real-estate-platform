# Document Storage — Full Technical Audit

Analysis-only report. No code, DB, migrations, or logic was changed.

---

## PART 1 — STORAGE BUCKET INVENTORY

| Bucket | What it stores | Where used in code | Upload path patterns | Public/private | UI sections |
|--------|----------------|--------------------|------------------------|----------------|-------------|
| **property-docs** | Card 1 property documents (lease, handover, utilities, BKA, ZVU, An/Abmeldung, Zweckentfremdung, deposit proof files), plus generated Übergabeprotokoll DOCX/PDF | `services/supabaseService.ts` (propertyDocumentsService, propertyDepositProofsService), `api/protocols/uebergabeprotokoll/generate.ts`, `generate-pdf.ts`, `get-url.ts` | `properties/{propertyId}/{type}/{docId}_{filename}`; deposit: `deposit_proofs/{propertyId}/{proofType}/{id}_{filename}`; protocols: `properties/{propertyId}/bookings/{bookingId}/uebergabeprotokoll_*.docx` or `*.pdf` | Private (signed URLs) | AccountDashboard Card 1 "Документи та договори", Kaution block, Protocol generation |
| **property-files** | Einzug/Auszug task files (keys, photos, meter readings); payment chain attachments | `services/supabaseService.ts` (fileUploadService, paymentChainFilesService, paymentChainService), `tools/tour3d-converter/src/server.js` (only property-media — not property-files) | Einzug/Auszug: `{propertyId}/{Einzug|Auszug}/{date - companyName}/step{N}_{stepName}/{timestamp}-{file.name}`; payment chain: `properties/{propertyId}/payment-chain/{tileKey}/{yyyy-mm}/{timestamp}_{safeName}` | Policies in migrations reference bucket; creation may be manual or in another migration | AccountDashboard (Einzug/Auszug workflow uploads), Payment chain UI; payment chain RLS restricts paths to `%/payment-chain/%` |
| **property-media** | Property gallery photos, Magic Plan reports, floor plans, 3D tour assets (GLB/OBJ etc.) | `services/propertyMediaService.ts`, `tools/tour3d-converter/src/server.js`, `supabase/functions/tour3d-convert-enqueue/index.ts` | Via propertyMediaService (path not fully traced in this audit); tour3d: uploads/downloads by storage_path in `property_media_assets` | Mixed: RLS for owned; public policies for gallery/marketplace/cover | Property media/gallery, marketplace, cover photo; 3D converter |
| **property-inventory-docs** | Per-property inventory/OCR document files | `services/propertyInventoryService.ts` | `property/{propertyId}/{documentId}/{safeName}` | Private (signed URLs) | AccountDashboard property inventory (documents + items) |
| **property-expense-docs** | Property expense invoice PDFs/images | `services/propertyExpenseService.ts`, migrations | `property/{propertyId}/{documentId}/{safeFileName}` (from migration comment) | Private; RLS by property ownership | AccountDashboard expense documents/items |
| **property-meter-photos** | Meter reading photos | `services/propertyMeterService.ts` | (paths in property_meter_photos table) | Private (owner-scoped policies) | Property meter readings UI |
| **invoice-pdfs** | Proforma/invoice PDFs | `services/supabaseService.ts` (uploadInvoicePdf), InvoiceModal | Path prefix optional; typically `{pathPrefix}/{timestamp}-{filename}` | Public in early migration; may be overridden | Invoices/proformas (file_url on invoices table) |
| **payment-proofs** | Payment confirmation PDFs (bank statement / proof) | `services/supabaseService.ts` (paymentProofsService), ConfirmPaymentModal, PaymentProofPdfModal | `payments/{invoiceId}/{proofId}/{timestamp}_{filename}.pdf` | Created public, later migration can make private (Staff policies) | Confirm payment flow; payment_proofs.file_path, invoices.payment_proof_url |
| **task-media** | Task chat attachments (Facility) | `services/supabaseService.ts` (task chat helpers), AdminMessages, AdminCalendar, TaskDetailModal | `{calendarEventId}/{timestamp}-{safeName}` | Private (authenticated policies) | Facility Messages, Calendar task chat, Kanban task detail chat |
| **templates** | DOCX templates (e.g. Übergabeprotokoll) | `api/protocols/uebergabeprotokoll/generate.ts`, `generate-pdf.ts`, `scripts/upload-uebergabeprotokoll-template.js` | `guest/uebergabeprotokoll/v1/template.docx` (script) | Private (signed URL for download) | Server-side only (protocol generation) |

**Note:** Bucket `property-files` is referenced in migration `20260223120002_create_payment_chain_tables.sql` with the comment that it "must already exist (used elsewhere)". No migration in the audited set was found that creates it; it may be created manually or in another file.

---

## PART 2 — DATABASE INVENTORY FOR DOCUMENTS

| Table | Relevant columns | Entity | Storage reference | Feature |
|-------|------------------|--------|-------------------|---------|
| **property_documents** | id, property_id, type, file_path, title, doc_date, notes, meta, created_at | Property | file_path → bucket **property-docs** | Card 1 documents (Mietvertrag, Übergabeprotokoll, Utility, BKA, ZVU, An/Abmeldung, Zweckentfremdung, etc.) |
| **property_deposit_proofs** | id, property_id, proof_type, bucket, file_path, original_filename, mime_type, created_at | Property (Kaution) | bucket + file_path → **property-docs** | Kaution payment/return proofs (separate from property_documents) |
| **property_inventory_documents** | id, property_id, file_url, file_name, file_hash, storage_path (added later), invoice_number, purchase_date, store, ocr_raw | Property | storage_path → **property-inventory-docs** (file_url legacy?) | Inventory OCR docs per property |
| **property_inventory_items** | document_id (FK to property_inventory_documents) | — | — | Line items from inventory docs |
| **property_expense_documents** | id, property_id, storage_path, file_name, file_hash, invoice_number, invoice_date, vendor, ocr_raw | Property | storage_path → **property-expense-docs** | Expense invoice documents |
| **property_expense_items** | document_id (FK to property_expense_documents), category_id, etc. | — | — | Expense line items |
| **property_media_assets** | id, property_id, type (photo, magic_plan_report, floor_plan, tour3d), file_name, storage_path, mime_type, size_bytes, external_url | Property | storage_path → **property-media** | Gallery, floor plans, 3D tours |
| **property_meter_photos** | id, reading_id, storage_path, etc. | Meter reading | storage_path → **property-meter-photos** | Photos attached to meter readings |
| **payment_chain_edges** | property_id, edge_key, breakdown, etc. (no file column) | Property | — | Payment chain tiles (attachments in JSON or separate table) |
| **payment_chain_files** | id, property_id, tile_key, storage_path, file_name, mime_type, size_bytes, uploaded_by | Property (payment chain tile) | storage_path → **property-files** (path contains payment-chain) | Payment chain file metadata |
| **properties** | payment_chain (JSONB) | Property | JSON can hold attachment paths in **property-files** | Legacy payment chain tile attachments (path in bucket) |
| **invoices** | file_url, payment_proof_url | Invoice | file_url → **invoice-pdfs**; payment_proof_url from payment_proofs or direct URL | Proforma/invoice PDF; payment proof link |
| **payment_proofs** | id, invoice_id, file_path, file_name, file_uploaded_at | Invoice | file_path → **payment-proofs** | One current proof per invoice + history |
| **task_chat_messages** | id, calendar_event_id, sender_id, message_text, attachments (JSONB) | Task (calendar_events) | attachments: array of { bucket, path, filename, mimeType, size } → **task-media** | Task chat attachments |
| **calendar_events** | description (can be JSON e.g. transfer_inventory), images (?) | Task | No direct file column; images may be URLs or refs | Task metadata (no attachment storage in this table) |

**Places where “documents” are stored only as path/JSON/array:**

- **Storage path in table:** property_documents.file_path, property_deposit_proofs.file_path, property_expense_documents.storage_path, property_inventory_documents.storage_path, property_media_assets.storage_path, property_meter_photos.storage_path, payment_chain_files.storage_path, payment_proofs.file_path.
- **JSON array:** task_chat_messages.attachments (bucket + path per item); properties.payment_chain (tile attachments paths).
- **URL in row:** invoices.file_url, invoices.payment_proof_url (often public or signed URL stored for quick access).
- **Generated docs:** Übergabeprotokoll DOCX/PDF written to **property-documents** under `properties/{propertyId}/bookings/{bookingId}/...`; no dedicated “protocols” table — path is returned as signed URL to client.

---

## PART 3 — DOCUMENT FLOWS BY FEATURE

### Property documents (Card 1)

- **Source:** User uploads PDF/image in AccountDashboard.
- **Upload:** `propertyDocumentsService.uploadPropertyDocumentFile()` → bucket **property-docs**, path `properties/{propertyId}/{type}/{docId}_{filename}`.
- **DB:** `property_documents` row (id, property_id, type, file_path, meta, etc.).
- **UI:** AccountDashboard → selected property → "Документи та договори" → tables per type (Mietvertrag, Übergabeprotokoll, Utility, BKA, ZVU, An/Abmeldung). View via `getDocumentSignedUrl(filePath)`; delete via `deletePropertyDocumentHard()` (storage remove + row delete).

### Owner / contract files

- Same as above: lease_contract, handover_protocol, and other types in `property_documents`; all in **property-docs**. No separate “owner” table; ownership is property-level.

### Tenant / rental files

- No dedicated “tenant documents” table. Tenant-related docs are stored as property_documents (e.g. handover_protocol) or in booking/protocol flow (see below).

### Move-in / move-out (Einzug / Auszug)

- **Source:** Worker uploads in workflow (keys, before_photos, meter_readings, etc.).
- **Upload:** `fileUploadService.uploadTaskFile()` → bucket **property-files**, path `{propertyId}/{Einzug|Auszug}/{date - companyName}/step{N}_{stepName}/{timestamp}-{file.name}`.
- **DB:** No dedicated “document” row; paths are stored inside task (e.g. calendar_events.workflow_steps or checklist / description). File list may be derived from storage listing (e.g. TaskDetailModal lists `task.id` folder in task-media for chat; Einzug/Auszug use property-files and different structure).
- **UI:** Task workflow steps / checklist in TaskDetailModal or similar; files opened via storage URL.

### Übergabeprotokoll / UBK / generated protocols

- **Source:** API generates DOCX (and optionally PDF) from template + booking/property data.
- **Template:** Bucket **templates**, path e.g. `guest/uebergabeprotokoll/v1/template.docx` (script upload).
- **Output:** Bucket **property-documents**, path `properties/{propertyId}/bookings/{bookingId}/uebergabeprotokoll_{checkInLabel}.docx` or `.pdf`.
- **DB:** No protocol row; path returned as signed URL to client. Booking/property identify the object.
- **UI:** User triggers generate from booking/protocol flow; downloads via returned URL.

### Task chat attachments

- **Source:** User attaches file in TaskDetailModal, AdminMessages, or AdminCalendar task chat.
- **Upload:** Client uploads to **task-media**, path `{calendarEventId}/{timestamp}-{safeName}`; then `insertTaskChatMessageWithAttachment()` with payload `[{ bucket, path, filename, mimeType, size }]`.
- **DB:** `task_chat_messages.attachments` (JSONB array).
- **UI:** Facility Messages, Calendar task panel, Kanban task modal; open via signed URL from `getTaskAttachmentSignedUrl(bucket, path)`.

### Inventory-related docs

- **Property inventory (OCR):** Upload in AccountDashboard → `propertyInventoryService.createDocumentAndUpload()` or upload + insert; bucket **property-inventory-docs**, path `property/{propertyId}/{documentId}/{safeName}`; DB `property_inventory_documents` (storage_path). Shown in inventory section; view via `getDocumentSignedUrl(storagePath)`.
- **Expense invoices:** Upload via propertyExpenseService; bucket **property-expense-docs**; DB `property_expense_documents.storage_path`. Shown with expense items; signed URL for view.

### Expense / invoice docs

- **Invoices (proforma/PDF):** `uploadInvoicePdf()` → **invoice-pdfs**; URL stored in `invoices.file_url`. UI: InvoiceModal, invoice list.
- **Payment proofs:** `paymentProofsService.uploadPaymentProofFile()` → **payment-proofs**, path `payments/{invoiceId}/{proofId}/{timestamp}_{filename}`; path stored in `payment_proofs.file_path`; current proof linked via invoices.payment_proof_url or UI logic. UI: ConfirmPaymentModal, PaymentProofPdfModal.

### Offer / reservation / payment chain

- **Payment chain:** Files attached to tiles (owner, company1, company2). Upload via `paymentChainFilesService.upload()` → **property-files**, path `properties/{propertyId}/payment-chain/{tileKey}/{yyyy-mm}/{timestamp}_{safeName}`; metadata in `payment_chain_files` (storage_path). Old flow may store paths in `properties.payment_chain` JSON. UI: Payment chain section in AccountDashboard.

### Other

- **Property media (photos, floor plans, 3D):** propertyMediaService → **property-media**; `property_media_assets.storage_path`. Gallery, marketplace, cover.
- **Meter photos:** propertyMeterService → **property-meter-photos**; `property_meter_photos.storage_path`. Meter readings UI.
- **Kaution proofs:** propertyDepositProofsService → **property-docs** (deposit_proofs/ subpath); `property_deposit_proofs.bucket` + `file_path`. Card 1 Kaution block.

---

## PART 4 — CURRENT DOCUMENT GROUPING LOGIC

- **Single table, UI-only groups:** The “Documents” area in AccountDashboard (Card 1) is one section “Документи та договори” and one source of data: `property_documents`. Grouping is **by document type** only:
  - **Mietvertrag** = `card1Documents.filter(d => d.type === 'lease_contract')`
  - **Übergabeprotokoll** = `d.type === 'handover_protocol'`
  - **Utility** = `UTILITY_TYPES` (supplier_electricity, gas, water, waste)
  - **BKA** = `d.type === 'bk_abrechnung'`
  - **ZVU** = `d.type === 'zvu'`
  - **An-/Abmeldung** = `d.type === 'an_abmeldung'`
- **Labels:** From constants in AccountDashboard: `DOCUMENT_TYPE_LABELS`, `DOCUMENTS_MODULE_LABELS` (e.g. Mietvertrag, Übergabeprotokoll, Utility). No DB category table for these; type is an enum in `types.ts` (`PropertyDocumentType`).
- **Einzug vs Auszug:** These are **not** document types in `property_documents`. They are task types; files for Einzug/Auszug live under **property-files** with path segments `Einzug` or `Auszug`. So “Einzug” and “Auszug” as document groups exist only implicitly by **path** (and task type), not by a DB document type or folder table.
- **Aktuell / Verträge / Rechnungen:** Not found as explicit folder names in the audited code. The current UI uses the type-based blocks above (Mietvertrag, Übergabeprotokoll, Utility, BKA, ZVU, An/Abmeldung). “Rechnungen” could correspond to expense docs (property_expense_documents) or invoice PDFs (invoices), which are **separate** from Card 1 documents.
- **Conclusion:** Folders/categories are **UI-only**: fixed constants and filters on `property_documents.type`. No DB-backed folder entity. No path-based grouping in the Documents section; path is only `properties/{propertyId}/{type}/...` for storage organization.

---

## PART 5 — RELATIONSHIP MAP

- **Property-level documents**
  - property_documents (all Card 1 types) → property_docs
  - property_deposit_proofs → property-docs (deposit_proofs/)
  - property_inventory_documents → property-inventory-docs
  - property_expense_documents → property-expense-docs
  - property_media_assets → property-media
  - payment_chain_files + properties.payment_chain → property-files (payment-chain/)
- **Rental-period / booking / move-in–move-out**
  - Übergabeprotokoll generated files → property-documents (properties/{id}/bookings/{id}/)
  - Einzug/Auszug task files → property-files (by property + task type + date/company)
- **Tenant-level**
  - No dedicated tenant document table; tenant context via booking/address book in handover_protocol meta.
- **Booking/reservation-level**
  - Protocol output path includes bookingId; no bookings.documents table.
- **Invoice-level**
  - invoices.file_url → invoice-pdfs
  - payment_proofs.file_path → payment-proofs
- **Task-level**
  - task_chat_messages.attachments → task-media
- **Protocol-level**
  - Generated DOCX/PDF in property-documents; no protocols table.

**What is grouped by property:** All of the above except invoices/payment_proofs (grouped by invoice) and task_chat_messages (grouped by calendar_event_id). In the UI, “Documents” is property-scoped (selected property) and then by type.

**What is grouped by event/task:** Task chat attachments (by calendar_event_id). Einzug/Auszug files are grouped by property + task type + date in path, not by a task document table.

**What is grouped by document type:** Card 1 list is grouped by property_documents.type (fixed enum). Expense and inventory docs are separate tables and UIs.

**What is NOT grouped but could be:** Generated protocols are not in a “protocols” table; they live only under property-documents path. Einzug/Auszug files are not in a documents table, only in storage paths. Invoice and payment-proof files are tied to invoices, not to property in a unified document list.

---

## PART 6 — RAW TECHNICAL STRUCTURE SUMMARY

**1) Current buckets**

- property-docs  
- property-files  
- property-media  
- property-inventory-docs  
- property-expense-docs  
- property-meter-photos  
- invoice-pdfs  
- payment-proofs  
- task-media  
- templates  

**2) Current DB tables/columns (document-related)**

- property_documents: file_path  
- property_deposit_proofs: bucket, file_path  
- property_inventory_documents: storage_path, file_url  
- property_expense_documents: storage_path  
- property_media_assets: storage_path, external_url  
- property_meter_photos: storage_path  
- payment_chain_files: storage_path  
- payment_proofs: file_path  
- invoices: file_url, payment_proof_url  
- task_chat_messages: attachments (JSONB)  
- properties: payment_chain (JSONB, may contain paths)  

**3) Current path conventions**

- property-docs: `properties/{propertyId}/{type}/{docId}_{filename}`; `deposit_proofs/{propertyId}/{proofType}/{id}_{filename}`; `properties/{propertyId}/bookings/{bookingId}/uebergabeprotokoll_*.docx|.pdf`  
- property-files: `{propertyId}/{Einzug|Auszug}/{date - companyName}/step{N}_{stepName}/{ts}-{name}`; `properties/{propertyId}/payment-chain/{tileKey}/{yyyy-mm}/{ts}_{safe}`  
- property-inventory-docs: `property/{propertyId}/{documentId}/{safeName}`  
- property-expense-docs: `property/{propertyId}/{documentId}/{safeFileName}`  
- payment-proofs: `payments/{invoiceId}/{proofId}/{timestamp}_{filename}.pdf`  
- task-media: `{calendarEventId}/{timestamp}-{safeName}`  
- templates: `guest/uebergabeprotokoll/v1/template.docx`  

**4) Current grouping logic**

- One property_documents table; UI groups by `type` (fixed enum). No DB folder/category table. Einzug/Auszug grouping is by path and task type, not by document table.

**5) Current weak spots / fragmentation points**

- Many buckets and tables for “documents” with no single registry or unified document model.  
- Same bucket (property-docs) used for user uploads and for generated protocols; path convention distinguishes them but there is no shared “document” entity.  
- property-files used for both Einzug/Auszug and payment chain; only path prefix (payment-chain) and RLS distinguish.  
- Deposit proofs in a separate table from property_documents but same bucket.  
- Invoices and payment proofs are invoice-scoped; not visible in property document list.  
- Task attachments are JSONB arrays; no normalized document row per file.  
- Generated protocols have no DB row; only storage path and returned URL.  

---

## READY FOR REDESIGN

- **Biggest structural problems:** Many buckets and tables with no single document registry; protocol outputs and deposit proofs live alongside generic property docs in the same bucket with no shared entity; task attachments are inline JSONB.  
- **Biggest sources of duplication:** Multiple “document” or “file” concepts (property_documents, property_deposit_proofs, payment_chain_files, property_inventory_documents, property_expense_documents, task_chat_messages.attachments, invoices.file_url, payment_proofs.file_path) and overlapping path patterns across property-docs and property-files.  
- **Biggest sources of confusion:** “Documents” in the UI is only a slice (property_documents by type); other document-like data (invoices, payment proofs, expense docs, inventory docs, protocols, task attachments, Einzug/Auszug files) live elsewhere and are not grouped in one place. No single place to answer “all documents for this property” or “all documents for this booking/task.”
