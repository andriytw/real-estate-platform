-- Set default for property_expense_categories.user_id so inserts don't need to pass it.
-- Idempotent; safe to run multiple times. RLS still enforces user_id = auth.uid().

ALTER TABLE public.property_expense_categories
  ALTER COLUMN user_id SET DEFAULT auth.uid();
