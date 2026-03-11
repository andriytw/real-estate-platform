# Offers table: multi-apartment schema and behavior (locked)

This document locks schema and behavior for the extended `public.offers` table used for both single-offer and multi-apartment (grouped) offers.

---

## 1. `offer_no` and UNIQUE constraint

- **Rule:** Multiple rows in the same logical multi-apartment offer **share the same `offer_no`**. Therefore `offer_no` must **not** be unique on `public.offers`.
- **In this repo:** Uniqueness is enforced **only** by the UNIQUE INDEX `idx_offers_offer_no` (see `supabase/migration_offers_offer_no.sql`); the base schema has no UNIQUE constraint on `offer_no`. So dropping that index is sufficient here.
- **Migration:** Any existing UNIQUE index on `offers.offer_no` (e.g. `idx_offers_offer_no`) is **dropped** in the extend-offers migration so that N rows can share one offer number. The migration also defensively drops any UNIQUE **constraint** on `offer_no` (e.g. if one was added manually in another environment).
- **Generation:** One `offer_no` per logical offer is obtained via RPC `get_next_offer_no()` (which calls `generate_offer_no()`). The same value is written to all N rows of that group.

---

## 2. `offer_group_id` generation and assignment (single place)

- **Rule:** One UUID per logical (multi-apartment) offer; that same UUID is stored on **every** row belonging to that offer.
- **Generation:** Generated **exactly once per save** in the multi-apartment save flow (e.g. in `offersService.createGroupFromMultiApartmentDraft`): one `crypto.randomUUID()` (or equivalent) per logical offer. **Not** generated per row; the same UUID is assigned to all N rows of that group.
- **Single place:** This is the only place where `offer_group_id` is set for new grouped offers; do not set or generate it elsewhere for new groups.
- **Single-offer rows:** Rows that are not part of a multi-apartment group have `offer_group_id = NULL`. Existing legacy rows remain with `offer_group_id = NULL`.

---

## 3. Legacy `status` vs new `item_status` (no dual source of truth)

- **Downstream and commercial flow use only `status`.** Proforma creation, payment confirmation, RPCs (e.g. `mark_invoice_paid_and_confirm_booking`), and Offers tab actions (Send Offer, Add Proforma, Proforma added) must read **only** `status`. No logic may treat `item_status` as a substitute for or equal to `status` for the commercial flow.
- **`status` (legacy column, required):** Lifecycle of the **offer row** for the commercial/booking flow. Values: `Draft` | `Sent` | `Invoiced` | `Accepted` | `Lost` | `Rejected` | `Expired`. Used by:
  - Downstream: proforma creation, payment confirmation, RPCs (e.g. `mark_invoice_paid_and_confirm_booking`).
  - UI: Offers tab (Send Offer, Add Proforma, Proforma added).
- **`item_status` (new column, optional):** Used **only** for grouped-offer UX / selection semantics (e.g. which apartment in the group is "Selected" for proforma). Per-apartment state **only when the row is part of a grouped multi-apartment offer**. Values: `Offered` | `Selected` | `Converted` | `Rejected` | `Expired`. **Not** read by InvoiceModal, handleCreateInvoiceClick, proforma creation, or payment confirmation; they rely on `status` and one row = one offer.
- **Semantics:** For any row, **`status`** is the single source of truth for “can add proforma / is invoiced / is accepted / lost”. **`item_status`** is supplementary and only meaningful when `offer_group_id IS NOT NULL`. Single-offer rows use `item_status = NULL`.

---

## 4. Snapshot fields as canonical commercial display

- For **grouped multi-apartment offers**, the snapshot columns on `offers` are the **canonical** values used for commercial display (address line, apartment code, etc.):
  - `street_snapshot`, `house_number_snapshot`, `zip_snapshot`, `city_snapshot`, `apartment_code_snapshot`, `apartment_group_snapshot`
- **Usage:** When building the “apartment line” (or equivalent) for the Offers list or any commercial view, use these snapshot fields when present (e.g. when `apartment_code_snapshot IS NOT NULL` or `offer_group_id IS NOT NULL`). Fall back to `unit` or property lookup for legacy/single-offer rows.
- This avoids depending on live `properties` data for grouped offers and keeps display stable even if the property record changes.

---

## 5. One `offers` row and downstream flow (unchanged)

One row in `public.offers` must continue to contain **all** data required by the existing downstream flow. Verification:

| Consumer | Required from one offer row | Satisfied by |
|----------|-----------------------------|--------------|
| **handleCreateInvoiceClick** | Pass one `OfferData` (one row) into InvoiceModal | Each row is full `OfferData`; row is passed as `offer`. |
| **InvoiceModal** | `id`, `propertyId`, `dates`, `price`, `clientName`, `address`, `internalCompany`; `offerId` / `offerIdSource` = row `id`; optional `reservationId` | All present on each row. `price` and `dates` set per row (e.g. `price` = gross for that apartment). |
| **Proforma creation** | `offerId` / `offerIdSource` = offer row `id`; reservation lookup by `propertyId` + dates if needed | One proforma per offer row; `offerIdSource` = row `id`. |
| **Payment confirmation** | RPC uses invoice → `offer_id`; offer row is the one linked to that invoice | One row per proforma; no change. |

**Conclusion:** One `offers` row still carries everything needed for handleCreateInvoiceClick, InvoiceModal, proforma creation, and payment confirmation. The downstream flow remains unchanged; no schema or API change is required there.
