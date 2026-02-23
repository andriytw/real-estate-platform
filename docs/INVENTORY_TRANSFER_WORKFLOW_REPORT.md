# Inventory Transfer Workflow — Analysis Report (Read-Only)

**Goal:** Document the current “warehouse → property” inventory transfer workflow end-to-end and identify why inventory might not appear on the property card after manager confirmation.

**Scope:** Code inspection and workflow mapping only. No code changes.

---

## 1) Data model (tables / fields)

### Warehouse inventory

| Table | Key fields for transfer |
|-------|--------------------------|
| **`warehouse_stock`** | `id` (stockId), `warehouse_id`, `item_id`, `quantity`. Decreased by transfer. |
| **`warehouses`** | `id` (warehouseId). |
| **`items`** | Item master (e.g. `id` = itemId). |
| **`stock_movements`** | `warehouse_id`, `item_id`, `type` ('OUT'), `quantity`, `reason` ('Transfer to property (confirmed)'), `property_id`. Inserted on transfer. |

### Property inventory

| Table | Key fields |
|-------|------------|
| **`properties`** | `id` (propertyId), **`inventory`** (JSON/array). Property card reads from this. Transfer writes here via `propertiesService.update(propertyId, { ...property, inventory: newInventory })`. |

### Tasks / calendar tasks

| Table | Key fields for transfer |
|-------|--------------------------|
| **`calendar_events`** | `id`, `title`, `property_id`, `worker_id`, `manager_id`, **`status`** (open → done_by_worker → verified), **`department`** ('facility'), **`description`** (JSON payload). All task create/update/read goes through this table (no separate `tasks` table). |

### Task payload (meta) in `description`

Stored as JSON in **`calendar_events.description`**:

- **`action`**: `'transfer_inventory'`
- **`transferData`**: array of `{ stockId, warehouseId, itemId, itemName, quantity, unitPrice, sku, invoiceNumber, purchaseDate, vendor }`
- **`propertyId`**: target property UUID
- **`originalDescription`**: human-readable text
- **`transferExecuted`**: boolean flag set to `true` after transfer runs (prevents double execution)

---

## 2) Property card: where inventory is READ from

- **UI:** [components/AccountDashboard.tsx](components/AccountDashboard.tsx) — section “Меблі (Інвентар)” (around line 6258).
- **Rendered value:** `selectedProperty.inventory` — table body iterates `selectedProperty.inventory.map(...)` (line 6297).
- **Source of `selectedProperty`:** Derived from React state: `properties.find(p => p.id === selectedPropertyId)`. So the card shows whatever is in the in-memory `properties` array for the selected property.
- **Origin of `properties`:** Loaded via **propertiesService** (`getAll` / `getById`). In [services/supabaseService.ts](services/supabaseService.ts), properties are read from **`properties`** and transformed with **`transformPropertyFromDB`**, which sets `inventory: Array.isArray(db.inventory) ? db.inventory : (db.inventory ? JSON.parse(db.inventory) : [])`.
- **Filter / “belongs to this property”:** There is no separate filter. The card shows the **`inventory`** array of the **selected property** (same row in `properties`). Items “belong” to the property because they are stored in that row’s `inventory` column.
- **What must be set for an item to appear:** The item must be present in **`properties.inventory`** for that property (either loaded initially or updated in state after a transfer). The transfer flow writes to this same field and then updates local state with `setProperties`.

---

## 3) Warehouse → task creation flow (WRITE)

- **Location:** [components/AccountDashboard.tsx](components/AccountDashboard.tsx) — **`handleExecuteTransfer`** (around 1580).
- **Supabase write:** **`tasksService.create(...)`** → insert into **`calendar_events`** ([services/supabaseService.ts](services/supabaseService.ts) — `tasksService.create` uses `.from('calendar_events').insert(...)`).
- **Task meta in `description` (JSON):**
  - **`action`**: `'transfer_inventory'`
  - **`transferData`**: array of selected warehouse rows (stockId, warehouseId, itemId, itemName, quantity, unitPrice, sku, invoiceNumber, purchaseDate, vendor)
  - **`propertyId`**: `transferPropertyId` (target property)
  - **`originalDescription`**: human-readable string
  - **`transferExecuted`** is not set at creation (so it’s undefined/falsy until transfer runs).
- **Other task fields:** `propertyId: transferPropertyId`, `department: 'facility'`, `status: 'open'`, `type: 'Arbeit nach plan'`, `workerId: transferWorkerId`, checklist from transfer items, etc.
- **Confirmation:** **Property id is stored** in both top-level task (`propertyId`) and inside `description.propertyId`.

---

## 4) Worker Tasks board: “Виконати” step (WRITE)

- **Calendar path:** [components/AdminCalendar.tsx](components/AdminCalendar.tsx) — **`markTaskAsReview`** (line 370). Worker marks task as done → status set to **`done_by_worker`**, then **`onUpdateEvent(updated)`** (no direct Supabase call in AdminCalendar).
- **Who persists:** **AccountDashboard** passes **`handleAdminEventUpdate`** as **`onUpdateEvent`** to AdminCalendar ([AccountDashboard.tsx](components/AccountDashboard.tsx) ~7164). So when worker (or manager) updates a task, **`handleAdminEventUpdate`** runs: it updates local `adminEvents` and then calls **`tasksService.update(updatedEvent.id, updatedEvent)`** → update on **`calendar_events`** (status, worker_id, etc.), then dispatches **`window.dispatchEvent(new CustomEvent('taskUpdated'))`**.
- **DB write:** **`calendar_events`** row is updated (e.g. `status = 'done_by_worker'`, plus any other changed fields). No inventory or warehouse tables are touched here.
- **Status values (Calendar):** Worker sets **`done_by_worker`**. (If the worker uses a Kanban board elsewhere, that path may use different statuses such as `completed`; the transfer trigger in AccountDashboard only considers **`completed`** or **`verified`**.)

---

## 5) Manager Calendar: “Підтвердити виконання” step (WRITE)

- **Location:** [components/AdminCalendar.tsx](components/AdminCalendar.tsx) — **`approveAndArchiveTask`** (line 384). Manager clicks verify → status set to **`verified`**, then **`onUpdateEvent(updated)`**.
- **DB updates:** Same as worker step: **`handleAdminEventUpdate`** in AccountDashboard runs → **`tasksService.update(updatedEvent.id, updatedEvent)`** → **`calendar_events`** row updated (e.g. `status = 'verified'`). No other tables are updated in this handler.
- **Inventory transfer:** **Not finalized in the Calendar/confirm handler.** The confirm step only updates the task (status → `verified`) and dispatches **`taskUpdated`**. The actual reassignment of inventory (warehouse → property) happens in AccountDashboard when the **`taskUpdated`** listener runs (see section 7).

---

## 6) End-to-end state machine

| Step | Status (exact string) |
|------|------------------------|
| After task creation | **`open`** |
| After worker “Виконати” (Calendar) | **`done_by_worker`** |
| After manager “Підтвердити виконання” | **`verified`** |

Transfer execution in code only runs for tasks with **`status === 'completed'`** or **`status === 'verified'`**. So if the worker completes only via Calendar, the task becomes `done_by_worker` and the transfer runs only after the manager sets **`verified`**. If the worker completes via another UI that sets **`completed`**, the transfer could run at that point when the listener runs.

---

## 7) Where the transfer is supposed to happen

- **Step:** The transfer runs **after** a task update is persisted and **`taskUpdated`** is dispatched. It runs inside the **`taskUpdated`** listener in AccountDashboard (second `useEffect` that listens to `taskUpdated` and `kanbanTaskCreated`), which:
  1. Fetches Facility tasks: **`tasksService.getAll({ department: 'facility', workerId?: current user id })`**
  2. Loops over tasks: for each task with **`(status === 'completed' || status === 'verified')`** and **`description`** parseable as JSON with **`action === 'transfer_inventory'`** and **`!parsed.transferExecuted`**, it calls **`executeInventoryTransfer(parsed)`** and then updates the task’s **`description`** to set **`transferExecuted: true`** via **`tasksService.update(task.id, { description: JSON.stringify(parsed) })`**.

- **Exact DB mutations that perform the reassignment (inside `executeInventoryTransfer` in AccountDashboard):**
  1. **`warehouse_stock`**: **`warehouseService.decreaseStockQuantity(item.stockId, item.quantity)`** for each transfer line.
  2. **`stock_movements`**: **`warehouseService.createStockMovement({ type: 'OUT', ... })`** for each line.
  3. **`properties`**: **`propertiesService.update(propertyId, { ...property, inventory: newInventory })`** — this is the update that attaches inventory to the property. Then **`setProperties(...)`** updates local state so the property card shows the new inventory.

So the transfer **is** implemented and triggered by the **`taskUpdated`** listener when the refetched task list contains a completed/verified transfer task that has not yet been marked `transferExecuted`.

---

## 8) “Why inventory might not appear” (hypotheses grounded in code)

1. **Transfer runs only when Facility task list is refetched on `taskUpdated`.** The listener that runs the transfer lives in AccountDashboard and runs only when **`taskUpdated`** (or `kanbanTaskCreated`) fires and the user has the Facility/Calendar context loaded. If the manager confirms from a different tab, or the event listener is not active (e.g. different route or unmounted component), the refetch and the transfer loop may never run.

2. **Status mismatch.** The transfer loop only considers **`completed`** or **`verified`**. If the worker completes the task in a way that sets a different status (e.g. only `done_by_worker` and the manager never clicks “Підтвердити”), the loop will not run the transfer. So the manager must set status to **`verified`** (or something must set **`completed`**) for the transfer to run.

3. **Task not returned by `getAll` filters.** Facility tasks are loaded with **`department: 'facility'`** and, for manager/worker, **`workerId: current user id`** (with `.or(worker_id.eq.X, worker_id.is.null, status.eq.verified, status.eq.archived, status.eq.completed)`). So a task assigned to another worker should still appear once status is **`verified`**. If there is a different filter path (e.g. different role or missing `department: 'facility'` on the task), the transfer task might not be in the list and the loop would never see it.

4. **Missing or invalid task meta.** If **`description`** is not valid JSON, or **`parsed.action !== 'transfer_inventory'`**, or **`parsed.transferData`** is missing/empty, or **`parsed.propertyId`** is missing, **`executeInventoryTransfer`** will return early (with console errors) and the property’s `inventory` will not be updated. So a single bad/malformed task payload can prevent that task’s transfer from running.

5. **`transferExecuted` already true.** If a previous run set **`transferExecuted: true`** in the task’s description but the property update failed or was rolled back, the loop will skip this task on all future reloads and the inventory will never be applied.

6. **Property card shows stale state.** The card reads **`selectedProperty.inventory`** from the **`properties`** state. **`executeInventoryTransfer`** does call **`setProperties`** after a successful **`propertiesService.update`**, so the card should update. If the user is not on the same AccountDashboard view or **`selectedPropertyId`** is not the transferred property, they would not see the change until they open that property or reload.

---

## File paths and functions (by step)

### Property card (read)

- **File:** [components/AccountDashboard.tsx](components/AccountDashboard.tsx)  
  **What:** Renders “Меблі (Інвентар)” from **`selectedProperty.inventory`** (selectedProperty = `properties.find(...)`).  
  **Reads:** In-memory **`properties`** state, which is initially filled from **propertiesService** (→ **`properties`** table, **`inventory`** column).

### Task creation (warehouse → task)

- **File:** [components/AccountDashboard.tsx](components/AccountDashboard.tsx) — **`handleExecuteTransfer`**  
  **Writes:** **`tasksService.create`** → insert into **`calendar_events`** with `description` = JSON `{ action: 'transfer_inventory', transferData, propertyId, originalDescription }`, `department: 'facility'`, `status: 'open'`, etc.

### Worker “Виконати” (Calendar)

- **File:** [components/AdminCalendar.tsx](components/AdminCalendar.tsx) — **`markTaskAsReview`**  
  **Does:** Sets status to **`done_by_worker`**, calls **`onUpdateEvent(updated)`** (no direct DB call in AdminCalendar).  
- **File:** [components/AccountDashboard.tsx](components/AccountDashboard.tsx) — **`handleAdminEventUpdate`** (passed as **`onUpdateEvent`**)  
  **Writes:** **`tasksService.update(id, updatedEvent)`** → **`calendar_events`** update; then dispatches **`taskUpdated`**.

### Manager “Підтвердити виконання” (Calendar)

- **File:** [components/AdminCalendar.tsx](components/AdminCalendar.tsx) — **`approveAndArchiveTask`**  
  **Does:** Sets status to **`verified`**, calls **`onUpdateEvent(updated)`**.  
- **File:** [components/AccountDashboard.tsx](components/AccountDashboard.tsx) — **`handleAdminEventUpdate`**  
  **Writes:** Same as worker step — **`tasksService.update`** on **`calendar_events`**; then **`taskUpdated`**. No inventory or warehouse writes here.

### Transfer execution (where inventory is reassigned)

- **File:** [components/AccountDashboard.tsx](components/AccountDashboard.tsx) — **`taskUpdated`** listener (second `useEffect` with `handleTaskUpdated`)  
  **Reads:** **`tasksService.getAll({ department: 'facility', workerId? })`** → **`calendar_events`**.  
  **Logic:** For each task with status **`completed`** or **`verified`** and **`description`** with **`action === 'transfer_inventory'`** and **`!transferExecuted`**, calls **`executeInventoryTransfer(parsed)`** and then **`tasksService.update(task.id, { description })`** to set **`transferExecuted: true`**.  
- **File:** [components/AccountDashboard.tsx](components/AccountDashboard.tsx) — **`executeInventoryTransfer`**  
  **Writes:**  
  - **warehouse_stock** (decrease) and **stock_movements** (insert) via **warehouseService**  
  - **properties** (update **`inventory`**) via **propertiesService.update**  
  - Local state **`setProperties`** and **`setWarehouseStock`**; dispatches **`propertiesUpdated`**.

### Services (Supabase)

- **File:** [services/supabaseService.ts](services/supabaseService.ts)  
  **tasksService:** **`calendar_events`** (getAll, create, update).  
  **propertiesService:** **`properties`** (getById, update; **`inventory`** in transform).  
  **warehouseService:** **`warehouse_stock`**, **`stock_movements`** (decreaseStockQuantity, createStockMovement).

---

## One-paragraph summary

The workflow creates a Facility task in **`calendar_events`** with a JSON **`description`** containing **`action: 'transfer_inventory'`**, **`transferData`**, and **`propertyId`**. The worker marks it **`done_by_worker`** and the manager sets it **`verified`** via Calendar; both updates go through **AccountDashboard**’s **`handleAdminEventUpdate`**, which persists to **`calendar_events`** and dispatches **`taskUpdated`**. The actual transfer runs only in **AccountDashboard**’s **`taskUpdated`** listener: it refetches Facility tasks, finds tasks with status **`completed`** or **`verified`** and **`transfer_inventory`** with **`!transferExecuted`**, then runs **`executeInventoryTransfer`**, which decreases **warehouse_stock**; inserts **stock_movements**; updates **properties.inventory** and local **`properties`** state. The property card reads from that same **`properties`** state (and thus **`properties.inventory`**). If inventory does not appear, the most likely causes are that the **`taskUpdated`** listener never runs (wrong tab/context), the task never reaches **`verified`**/ **`completed`**, the task is excluded by **getAll** filters, the task **description** is missing or invalid, or **`transferExecuted`** was already set without a successful property update.
