# Звіт: прибирання шуму в production browser console

Документ описує **все**, що було прибрано або заґейчено в рамках cleanup (proof-транспорт, operational `console.log`, сервісні trace-логи), і **як** це зроблено — без зміни бізнес-логіки та auth/resume.

---

## 1. Загальні принципи

| Метод | Коли застосовано |
|--------|------------------|
| **Повне видалення** | Routine progress: `start` / `ok` / `loaded` / `fetch` / `transform`, success-chatter, тимчасові proof-маркери. |
| **`import.meta.env.DEV`** | Логи лише для локальної розробки (preview ключів Supabase, DEV-профіль тощо). У production-бандлі гілки зазвичай не виконуються. |
| **`isClientDebugLogsEnabled()` + `_dbg` / AuthGate** | Verbose WC:/tabResume/sync — лише якщо **`VITE_CLIENT_DEBUG_LOGS=1`**. |
| **`isClientDebugIngestEnabled()`** | POST на localhost ingest — лише **dev** + **`VITE_CLIENT_DEBUG_INGEST=1`**. |
| **`SHELL_RESUME_DEBUG`** (`lib/shellDebug.ts`) | `[shell-resume-debug]` у App/WorkerContext — не за замовчуванням у prod. |
| **Залишено `console.error` / змістовні `console.warn`** | Реальні збої, RLS/upload warnings, помилки завантаження даних. |

Додано хелпери в [`lib/clientDebug.ts`](../lib/clientDebug.ts): **`clientDebugLog`**, **`devConsoleLog`** (документовані env у файлі та в [`src/vite-env.d.ts`](../src/vite-env.d.ts)).

---

## 2. Фаза A — proof / localhost / tab-resume ingest (раніше в тій же гілці робіт)

### 2.1 Що прибрано

| Що | Де | Як |
|----|-----|-----|
| **`__proofMark978438`** + `fetch` на `http://127.0.0.1:7242/ingest/...`** | `ConfirmPaymentModal.tsx`, `Navbar.tsx`, `WorkerContext.tsx`, `AccountDashboard.tsx` (proof-блоки та виклики) | Рядки видалені; логіка обробників не змінювалась. |
| **Debug у `processLock`** (`console.warn` + `fetch` до 7242) | [`utils/supabase/client.ts`](../utils/supabase/client.ts) | Видалено лише інструментацію; залишено чергування `PROCESS_LOCKS` + виклик `fn()`. |
| **Gating `_dbg` у tab resume** | [`lib/tabResumeCoalesce.ts`](../lib/tabResumeCoalesce.ts) | На початку `_dbg`: якщо **не** `isClientDebugLogsEnabled()` — вихід; ingest — лише `isClientDebugIngestEnabled()`. |
| **AuthGate DBG** | [`components/AuthGate.tsx`](../components/AuthGate.tsx) | Блок з `console.warn` + `localStorage __dbg978438` обгорнуто в `isClientDebugLogsEnabled()`. |

### 2.2 Supabase client (не proof, а dev preview)

| Що | Як |
|----|-----|
| Лог превью URL/ключа | Лишається лише всередині **`if (import.meta.env.DEV && typeof window !== 'undefined')`** на верхньому рівні модуля. |

---

## 3. Фаза B — operational `console.log` / `info` / `debug` у UI та клієнтських сервісах

### 3.1 Kanban та task modals

| Файл | Що чистили | Як |
|------|------------|-----|
| [`components/kanban/KanbanBoard.tsx`](../components/kanban/KanbanBoard.tsx) | `loadBoardData:start/end`, `tasks/workers fetch:start|ok`, `transform:start|ok`, `customColumns sanitize:*`, `pruned stale workerIds`, події `workersUpdated` / `taskUpdated`, створення колонки, assign worker, clear localStorage | **Видалено** рядки `console.log` / `console.info`; залишено **`console.error`** на помилки fetch/transform та **`console.warn`** для невалідного UUID задачі. |
| [`components/kanban/TaskDetailModal.tsx`](../components/kanban/TaskDetailModal.tsx) | Chat load start/ok/empty, `console.debug` upload/list | **Видалено**; деструктуризація upload без невикористаного `uploadData` де потрібно. |

### 3.2 App та точка входу

| Файл | Що чистили | Як |
|------|------------|-----|
| [`App.tsx`](../App.tsx) | Page instance, loading properties (timing, slice даних), worker redirect traces, post-login, marketplace click | **Видалено** `console.log`. Залишені **`console.error` / `console.warn`** у `loadProperties` для реальних помилок / відсутніх properties / cover URLs. |
| [`src/index.tsx`](../src/index.tsx) | Стартові «React root / render» | **Видалено** `console.log`; **`console.error`** у boundary залишено. |

**Залишок у `App.tsx` (навмисно):**

- `if (SYNC_PATH_LOGS_ENABLED) console.log(...)` — константа **`false`** → у production **не виконується**.
- `if (SHELL_RESUME_DEBUG) console.log('[shell-resume-debug]', ...)` — у prod **false**, якщо не виставлено env для shell debug.

### 3.3 Invoice та Account dashboard

| Файл | Що чистили | Як |
|------|------------|-----|
| [`components/InvoiceModal.tsx`](../components/InvoiceModal.tsx) | Trace у `handleSave` (start / before|after onSave / finally) | **Видалено**; прибрано непотрібний імпорт `PAGE_INSTANCE_ID` якщо лишався лише для логів. |
| [`components/AccountDashboard.tsx`](../components/AccountDashboard.tsx) | Payment chain DEV `useEffect` (тільки логи), Facility/Accounting load+reload+taskUpdated, inventory delete/transfer OCR traces, meter convert/save, delete reservation debug, direct booking / multi-offer / invoice save traces, facility task creation success, task update success, `rooms debug` IIFE, shell pointerdown effect (лише для логів) | **Видалено** блоки та рядки; **`console.error`** для помилок залишено; **`console.warn`** для auto-task / фільтрації де релевантно; **`await tasksService.update`** без невикористаної змінної після прибирання логу. |
| Імпорти shell debug | `getShellDebugSnapshot`, `describeElementBrief`, `describeEventTarget` | **Видалено** з імпорту після видалення pointerdown-effect. |

### 3.4 Admin calendar

| Файл | Що чистили | Як |
|------|------------|-----|
| [`components/AdminCalendar.tsx`](../components/AdminCalendar.tsx) | `useEffect` лише з `console.info` assignee detail, workers load, chat load ok, task created, `openAttachment` debug, assignee BEFORE/AFTER/merged (DEV) | **Видалено** effect або рядки; залишено **`console.error`** для помилок. |

### 3.5 Інші компоненти

| Файл | Що чистили | Як |
|------|------------|-----|
| [`components/BookingDetailsModal.tsx`](../components/BookingDetailsModal.tsx) | `[DELETE] ...` console.log | **Видалено** |
| [`components/BookingListModal.tsx`](../components/BookingListModal.tsx) | Mock email data / sending | **Видалено** |
| [`components/PartnerModal.tsx`](../components/PartnerModal.tsx) | Submit success log | **Видалено** (якщо був) |
| [`components/PropertyDetails.tsx`](../components/PropertyDetails.tsx) | `[marketplace-gallery]` dev log | **Видалено**; **`console.error`** на fail залишено |

### 3.6 Сервіси (клієнтський бандл)

| Файл | Що чистили | Як |
|------|------------|-----|
| [`services/supabaseService.ts`](../services/supabaseService.ts) | Warehouse stock load, users create/invite/resend/update traces, tasks insert debug transfer, tasks.update DEV keys, properties `getAll` trace, address book `debug`, reservations/offers create trace (before/after/finally), `getNextOfferNo`, `createGroupFromMultiApartmentDraft` кроки, `uploadInvoicePdf` / `uploadPaymentProofFile` progress | **Видалено** усі **`console.log` / `info` / `debug`** у цьому файлі; залишені **`console.error`** та потрібні **`console.warn`** (наприклад upload catch, RLS після UPDATE); прибрано непотрібні змінні після видалення логів (`table`, `callShape`, `t0` де ставали мертвими). |

### 3.7 Утиліти

| Файл | Що чистили | Як |
|------|------------|-----|
| [`bookingUtils.ts`](../bookingUtils.ts) | Лог зміни статусу броні за замовчуванням | **Замінено** на умову: **`import.meta.env.DEV && options?.log`** — у production за замовчуванням тихо. |

---

## 4. WorkerContext та session profile (без зміни auth/resume)

| Що | Як |
|----|-----|
| **`getCurrentWorker`** | Усі `[DEV] console.log` вже всередині **`if (isDev && typeof window !== 'undefined')`** (або однорядкові з тією ж умовою). |
| **Sync / initial session** | `console.log` після `getSession` / `safeGetSession` — **`if (import.meta.env.DEV && typeof window !== 'undefined')`**. |
| **Tab resume** | `[shell-resume-debug]` — **`if (SHELL_RESUME_DEBUG)`**. |
| **`_dbg` з `tabResumeCoalesce`** | Виклики лишаються, але **`_dbg`** всередині перевіряє **`isClientDebugLogsEnabled()`** — без **`VITE_CLIENT_DEBUG_LOGS=1`** тихо. |
| [`lib/sessionProfileSelect.ts`](../lib/sessionProfileSelect.ts) | `logDevSessionProfileObservability` — на початку **`if (!import.meta.env.DEV \|\| typeof window === 'undefined') return`** — у prod не логує. |

Логіку `syncSessionAndWorker`, single-flight, `loadWorker`, `onAuthStateChange` **не змінювали** — лише прибирання/гейти виводу.

---

## 5. Що навмисно не чистили (поза scope «browser console»)

| Зона | Причина |
|------|---------|
| **`api/commands/*.ts`**, **`api/_lib/*.ts`** | Логи на **сервері** (Vercel), не в DevTools клієнта. |
| **`supabase/functions/*`** | **Edge** runtime. |
| Повне прибирання **`console.log` у WorkerContext** заміною на `devConsoleLog` | Не робилось масово, щоб не ризикувати регресією; умови DEV уже коректні. |

---

## 6. Env-змінні (підсумок)

| Змінна | Ефект |
|--------|--------|
| **`VITE_CLIENT_DEBUG_LOGS=1`** | Увімкнути `isClientDebugLogsEnabled()`, `_dbg`, AuthGate DBG, `clientDebugLog`. |
| **`VITE_CLIENT_DEBUG_LOGS=0`** | Примусово вимкнути. |
| **`VITE_CLIENT_DEBUG_INGEST=1`** (лише з **dev**) | Дозволити POST на local NDJSON ingest у `tabResumeCoalesce`. |
| **`VITE_SHELL_RESUME_DEBUG=1`** | Додаткові `[shell-resume-debug]` у App/WorkerContext/AccountDashboard (див. `SHELL_RESUME_DEBUG` у `shellDebug.ts`). |

---

## 7. Перевірка

- **`npm run build`** — успішно після змін.
- **Grep** по `components/**/*.tsx`: routine **`console.log|info|debug`** для UI прибрані; залишки в інших шарах — умовні (DEV / flags).

---

## 8. Повний список файлів, які торкалися cleanup (агреговано)

Алфавітно (можуть бути злиті з кількох комітів):

- `App.tsx`
- `bookingUtils.ts`
- `components/AccountDashboard.tsx`
- `components/AdminCalendar.tsx`
- `components/AuthGate.tsx`
- `components/BookingDetailsModal.tsx`
- `components/BookingListModal.tsx`
- `components/ConfirmPaymentModal.tsx`
- `components/InvoiceModal.tsx`
- `components/Navbar.tsx`
- `components/PartnerModal.tsx`
- `components/PropertyDetails.tsx`
- `components/kanban/KanbanBoard.tsx`
- `components/kanban/TaskDetailModal.tsx`
- `contexts/WorkerContext.tsx` (proof + поведінка без зміни orchestration; лише прибирання proof раніше)
- `lib/clientDebug.ts`
- `lib/tabResumeCoalesce.ts`
- `services/supabaseService.ts`
- `src/index.tsx`
- `src/vite-env.d.ts`
- `utils/supabase/client.ts`

---

*Документ відображає стан після виконання плану production console cleanup; деталі комітів див. `git log` за повідомленнями `chore:` / `console` / `cleanup`.*
