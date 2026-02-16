-- Property expense categories: per-user, used for per-item category_id on property_expense_items.
-- Do NOT reuse inventory tables.

CREATE TABLE IF NOT EXISTS public.property_expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, code)
);

COMMENT ON TABLE public.property_expense_categories IS 'User-defined categories for property expense items; category is per row, not per document.';

CREATE INDEX IF NOT EXISTS idx_property_expense_categories_user_active
  ON public.property_expense_categories(user_id, is_active, sort_order);

DROP TRIGGER IF EXISTS property_expense_categories_updated_at ON public.property_expense_categories;
CREATE TRIGGER property_expense_categories_updated_at
  BEFORE UPDATE ON public.property_expense_categories
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.property_expense_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "property_expense_categories_select" ON public.property_expense_categories;
CREATE POLICY "property_expense_categories_select" ON public.property_expense_categories
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "property_expense_categories_insert" ON public.property_expense_categories;
CREATE POLICY "property_expense_categories_insert" ON public.property_expense_categories
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "property_expense_categories_update" ON public.property_expense_categories;
CREATE POLICY "property_expense_categories_update" ON public.property_expense_categories
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "property_expense_categories_delete" ON public.property_expense_categories;
CREATE POLICY "property_expense_categories_delete" ON public.property_expense_categories
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
