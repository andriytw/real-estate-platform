# Property Expenses RLS — Backfill Variant B (manual)

After applying migration `20260228120003_secure_property_expense_rls.sql`, existing rows in `public.properties` have `user_id = NULL`. Expense documents/items and storage files for those properties are not accessible until ownership is set.

**Important:** Do NOT use `auth.uid()` in backfill. SQL Editor runs as **service role**; `auth.uid()` is NULL there. Use placeholders only (no real email or UUID in repo); replace with your values when running in SQL Editor.

---

## Step 1 — Find your user UUID

In SQL Editor, run (replace placeholder with your login email):

```sql
SELECT id, email
FROM auth.users
WHERE email = 'your-email@example.com';
```

Copy the `id` (UUID) — that is `<MY_UUID>` for the steps below.

---

## Step 2 — Assign all existing properties to that user

Replace `'<MY_UUID>'` with the UUID from Step 1:

```sql
UPDATE public.properties
SET user_id = '<MY_UUID>'::uuid
WHERE user_id IS NULL;
```

---

## Step 3 (optional) — Assign only specific properties

To assign a single property or a list:

```sql
UPDATE public.properties
SET user_id = '<MY_UUID>'::uuid
WHERE id IN (
  'property-uuid-1',
  'property-uuid-2'
)
AND user_id IS NULL;
```

Use the same `<MY_UUID>` from Step 1.

---

After backfill, expense RLS will allow that user to access docs/items and storage for the assigned properties.

---

**Note (categories):** Migration `20260228120004` sets `property_expense_categories.user_id` default to `auth.uid()`, so inserts from the app do not need to send `user_id` explicitly; RLS still enforces `user_id = auth.uid()`.
