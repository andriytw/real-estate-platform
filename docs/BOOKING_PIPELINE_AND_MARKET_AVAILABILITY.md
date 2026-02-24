# Єдиний план: Booking Pipeline + /market Availability (inspection + RLS-safe implementation)

Один повний документ: опис пайплайну бронювань, календар оренди, визначення блокування для /market і реалізація фільтра доступності (RLS-safe, тільки API, 60 днів, UI). Розділи 1–5 — аналіз (read-only), розділ 6 — зміни в коді.

---

## 1. Data model

### Tables (Supabase)

**reservations** (`supabase/migration_create_reservations.sql`)

- Holds/leads; allow overlaps. Only confirmed bookings (from `bookings` table) block.
- Key columns: `id` (UUID), `property_id` (FK → properties), `start_date`, `end_date`, `status` (see below), `lead_label`, `client_first_name`, `client_last_name`, `client_email`, `client_phone`, `client_address`, `guests_count`, `price_per_night_net`, `tax_rate`, `total_nights`, `total_gross`, `created_at`, `updated_at`.
- Status: `'open' | 'offered' | 'invoiced' | 'won' | 'lost' | 'cancelled'`.

**bookings** (`supabase/schema.sql` lines 71–115)

- Rows created only when an invoice is marked Paid (RPC `mark_invoice_paid_and_confirm_booking`). This is the "confirmed" table.
- Key columns: `id` (UUID), `room_id`, `property_id` (FK → properties), `start_date`, `end_date`, `guest`, `color`, `check_in_time`, `check_out_time`, `status`, `price`, `balance`, `guests`, `unit`, `comments`, `payment_account`, `company`, `rate_plan`, `guarantee`, `cancellation_policy`, `no_show_policy`, `channel`, `type` ('GUEST'|'BLOCK'), contact fields, `price_per_night`, `tax_rate`, `total_gross`, `guest_list`, `created_at`, `updated_at`.
- Source fields (migrations): `source_invoice_id`, `source_offer_id`, `source_reservation_id` (FKs to invoice, offer, reservation that led to this booking).
- Status (schema): `'reserved' | 'offer_prepared' | 'offer_sent' | 'invoiced' | 'paid' | 'check_in_done' | 'completed'`. RPC inserts new rows with `status = 'invoiced'` (`supabase/migration_rls_fix_rpc_security.sql` line 127).

**offers** (`supabase/schema.sql` 117–138, `supabase/migration_offers_reservation_client_message.sql`)

- Key columns: `id`, `client_name`, `property_id` (FK), `internal_company`, `price`, `start_date`, `end_date`, `status`, `guests`, `email`, `phone`, `address`, `check_in_time`, `check_out_time`, `guest_list`, `comments`, `unit`, `reservation_id` (FK → reservations), `created_at`, `updated_at`.
- Status: `'Draft' | 'Sent' | 'Invoiced' | 'Accepted' | 'Lost' | 'Rejected' | 'Expired'`.

**invoices** (`supabase/schema.sql` 141–158, `supabase/migration_invoices_reservation_id.sql`)

- Key columns: `id`, `invoice_number`, `date`, `due_date`, `internal_company`, `client_name`, `client_address`, `items`, `total_net`, `tax_amount`, `total_gross`, `status`, `offer_id` (FK → offers), `booking_id` (FK → bookings; set only after payment confirmed and booking created), `reservation_id` (FK → reservations; for proformas from reservation), `created_at`, `updated_at`.
- Status: `'Paid' | 'Unpaid' | 'Overdue'`.

**Relationships**

- Reservation → (optional) Offer (`offers.reservation_id`).
- Offer → Invoice (`invoices.offer_id`). Invoice can also have `reservation_id` (proforma from reservation); `booking_id` is null until payment is confirmed.
- When invoice is marked Paid: RPC creates one row in `bookings` (and sets `invoices.status = 'Paid'`), marks winning reservation `status = 'won'`, winning offer `status = 'Accepted'`, and overlapping reservations/offers as `lost`/`Lost`.

```
reservations → offers → invoices
                        invoices (Paid) → RPC → bookings
```

---

## 2. Status values and transitions

**Reservation statuses** (`supabase/migration_create_reservations.sql`, `types.ts` ~731)

- `open`, `offered`, `invoiced`, `won`, `lost`, `cancelled`.
- Transitions: created as `open`; updated to `offered` when offer prepared/sent; to `invoiced` when invoice created; to `won` when invoice paid (RPC); overlapping ones to `lost` by RPC.

**Offer statuses** (`types.ts` 611, migrations)

- `Draft`, `Sent`, `Invoiced`, `Accepted`, `Lost`, `Rejected`, `Expired`.
- Winning offer set to `Accepted` by RPC when invoice is marked Paid; offers linked to lost reservations set to `Lost`.

**Invoice/Proforma statuses** (`supabase/schema.sql` 153, `types.ts` 606)

- `Paid`, `Unpaid`, `Overdue`.
- Transition to `Paid`: only via RPC `mark_invoice_paid_and_confirm_booking(invoice_id)` (`AccountDashboard.tsx` ~4672–4682, ~4431–4452). That RPC also creates the `bookings` row and updates reservation/offer.

**Booking statuses** (`types.ts` BookingStatus enum 549–556, `supabase/schema.sql` 82)

- `reserved`, `offer_prepared`, `offer_sent`, `invoiced`, `paid`, `check_in_done`, `completed`.
- RPC inserts new booking with `status = 'invoiced'`. Any row in `bookings` is created only after payment confirm.

**Payment**

- No separate "payments" table. "Payment confirmed" = invoice `status = 'Paid'` and RPC has run, creating a `bookings` row. Optional: `payment_proofs` / proof upload and `rpcConfirmedAt` (`AccountDashboard.tsx` ~4430–4452) trigger the same RPC.

---

## 3. Rent Calendar rendering logic

**File:** `components/SalesCalendar.tsx`.

**Data sources merged** (535–541):

- `confirmedBookingsWithColors` = rows from `bookings` table (loaded via `bookingsService.getAll()` in `AccountDashboard.tsx` ~3613–3616), each with `color: getBookingStyle(b.status)` and `isConfirmed: true`.
- `reservationItems` = rows from `reservations` with `status NOT IN ('lost','won','cancelled')`, each with `isReservation: true`.
- `offerBookings` = offers converted to calendar blocks; status/color derived from linked reservation or invoice.

**All blocks:** `allBookings = [...confirmedBookingsWithColors, ...reservationItems, ...offerBookings]`.

**Style per block** (1326–1377):

- **Reservation stripe (turquoise, dashed or solid border):**
  - Condition: `(booking as any).isReservation === true`.
  - Visual: `bg-sky-500/70`. Border: if `reservationHasOffer` (`status === 'offered'`) then solid white, else **dashed**. Open hold = dashed; offer created/sent = solid border, still sky/turquoise.
- **Confirmed booking (thick solid bar):**
  - Condition: `isConfirmed === true` (from `confirmedBookingsWithColors`).
  - Visual: `getBookingColor(booking.status)` + `getBookingBorderStyle(booking.status)` from `bookingUtils.ts`.

**bookingUtils** (`bookingUtils.ts` 8–68):

- **Color:** `PAID` → `bg-emerald-600`; `RESERVED` / `OFFER_PREPARED` / `OFFER_SENT` / `INVOICED` → `bg-blue-600`; `CHECK_IN_DONE` → `bg-yellow-500`; `COMPLETED` → `bg-gray-500 opacity-50`.
- **Border:** `PAID`, `INVOICED`, `RESERVED`, `CHECK_IN_DONE`, `COMPLETED` → `border-2 border-solid`. `OFFER_PREPARED`, `OFFER_SENT` → `border-2 border-dashed`.

**Exact condition for "thick solid" (blocking) blocks:**

- Block is from `bookings` table: `(booking as any).isConfirmed === true` and `(booking as any).isReservation !== true`. Those rows exist only after payment is confirmed (RPC).
- **Thick solid = row in `bookings` (payment confirmed). Turquoise dashed = reservation without offer; turquoise solid border = reservation with offer; both non-blocking.**

---

## 4. "Availability" definition for /market

- **BLOCKING** = presence of at least one row in **`bookings`** for that property and date range. No other table blocks.
- **NON-BLOCKING** = reservations (any status except lost/won/cancelled), offers, and invoices with `Unpaid`/`Overdue`. They do not make the property unavailable.

**Exact condition for BLOCKING:**

- A row in table **`bookings`** with `property_id` = given property and date range overlap (see query below).
- No status filter: every row in `bookings` is created only by the RPC when an invoice is marked Paid.

**Do not use for blocking:**

- `reservations.status` — not blocking.
- `offers.status` — not blocking.
- `invoices.status = 'Paid'` alone — use `bookings` as source of truth.

---

## 5. Query recipe

**Goal:** Blocked `property_id`s for a selected date range (for /market availability filter).

**Overlap:** `start_date < selected_end AND end_date > selected_start`. Dates as `YYYY-MM-DD`; no timezone normalization in code.

**SQL:**

```sql
SELECT DISTINCT property_id
FROM public.bookings
WHERE start_date < :selected_end
  AND end_date > :selected_start
  AND property_id IS NOT NULL;
```

**Supabase client:**

```ts
const { data } = await supabase
  .from('bookings')
  .select('property_id')
  .lt('start_date', selectedEnd)
  .gt('end_date', selectedStart);
// Dedupe property_id in code (or use distinct in DB).
```

Use only the `bookings` table. Do not filter by `bookings.status` for blocking.

---

## Summary

| Concept                  | Source of truth                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------- |
| Reservations / holds     | `reservations` (open, offered, invoiced; won/lost/cancelled excluded from calendar) |
| Offers                   | `offers` (linked to reservations)                                                   |
| Invoices / proformas     | `invoices` (Paid/Unpaid/Overdue)                                                    |
| **Confirmed / blocking** | **`bookings`** (row created only when invoice marked Paid via RPC)                  |
| Turquoise dashed         | Reservation stripe, no offer (open hold)                                             |
| Turquoise solid border   | Reservation stripe, offer sent (offered)                                            |
| Thick solid bar          | Confirmed booking from `bookings` (payment confirmed)                               |

Blocking for /market = existence of at least one `bookings` row for the property with date range overlapping the selected interval. No other tables or statuses define blocking.

---

## 6. /market availability — RLS-safe implementation (one plan)

/market is used by **public users** (unauthenticated or non-admin). Direct client query to `bookings` fails under RLS. Availability must be **server-only** and **privacy-safe** (only property IDs, no guest/price/booking details).

### 6.1 Source of truth (unchanged)

- Blocking = **only** `public.bookings`; overlap `start_date < selected_end AND end_date > selected_start`.
- No reservations/offers/invoices. No `bookings.status` filter.

### 6.2 Public users cannot query bookings (RLS)

- Client must **never** call `supabase.from('bookings')` for availability.
- Availability **must** be fetched only via the serverless endpoint `GET /api/market/blocked-bookings`.

### 6.3 Serverless endpoint: `/api/market/blocked-bookings`

**Contract**

- **Request:** `GET /api/market/blocked-bookings?from=YYYY-MM-DD&to=YYYY-MM-DD`
- **Response:** JSON `{ property_ids: string[] }` (distinct UUIDs; no guest, price, or booking details).

**Validation (return `{ property_ids: [] }` on failure)**

- `from` or `to` missing/invalid → `{ property_ids: [] }`
- `from >= to` → `{ property_ids: [] }`
- **Max range 60 days:** if `(toDate - fromDate) > 60` days → `{ property_ids: [] }` (abuse protection).

**Server-side**

- Use `process.env.SUPABASE_URL` and `process.env.SUPABASE_SERVICE_ROLE_KEY`.
- Query: `from('bookings').select('property_id').lt('start_date', to).gt('end_date', from)`; filter null; dedupe; return as `property_ids`.

**Headers:** `Cache-Control: s-maxage=30, stale-while-revalidate=120`

### 6.4 Client fetch logic

**File:** `services/marketAvailabilityService.ts`

- **No** client Supabase for blocked IDs. **Single path:** always `fetch('/api/market/blocked-bookings?from=...&to=...')`.
- Parse JSON as `{ property_ids?: string[] }`; return `new Set(response.property_ids ?? [])`.
- Validate `from`/`to` (trim, `from < to`); else return `new Set()`.

State in `Marketplace.tsx` (`dateFrom`, `dateTo`, `blockedIds`, `loadingAvailability`) unchanged.

### 6.5 Date semantics and UI

- **From** = check-in date, **To** = check-out date. Overlap rule: `booking.start_date < to AND booking.end_date > from`.
- **UI labels (small text):** "From (check-in)" and "To (check-out)" on the two date inputs in `MarketMap.tsx` (e.g. `title`/`aria-label` or small `<span>` labels).

### 6.6 Empty state

- Left list: "No listings match your filters." + "Clear filters/dates"; map stays visible (0 markers). No full-page empty.

### 6.7 Environments

- Vercel (Production + Preview): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (Sensitive).

### 6.8 Acceptance

- Works for unauthenticated users on /market.
- Selecting dates filters out properties with overlapping rows in `bookings` only.
- No booking details leak — only `property_ids`.
- Date range > 60 days returns empty list.
- UI shows From = check-in, To = check-out.

### 6.9 Code edits summary

| File | Action |
|------|--------|
| `api/market/blocked-bookings.ts` | Return `{ property_ids: string[] }`; add 60-day max range; keep overlap + validation + cache headers |
| `services/marketAvailabilityService.ts` | Remove client Supabase; always fetch API; parse `response.property_ids` |
| `components/MarketMap.tsx` | Add UI labels: "From (check-in)", "To (check-out)" |
