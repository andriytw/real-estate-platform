-- Property expense invoices: documents + line items. Separate from property_inventory_*.
-- Append-only: each invoice = one document + N items.

CREATE TABLE IF NOT EXISTS public.property_expense_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  storage_path TEXT NULL,
  file_name TEXT NULL,
  file_hash TEXT NULL,
  invoice_number TEXT NULL,
  invoice_date DATE NULL,
  vendor TEXT NULL,
  ocr_raw JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.property_expense_documents IS 'Expense invoice documents per property; storage in bucket property-expense-docs.';

CREATE INDEX IF NOT EXISTS idx_property_expense_documents_property_created
  ON public.property_expense_documents(property_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_property_expense_documents_property_file_hash
  ON public.property_expense_documents(property_id, file_hash)
  WHERE file_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.property_expense_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  document_id UUID NULL REFERENCES public.property_expense_documents(id) ON DELETE SET NULL,
  category_code TEXT NULL,
  description TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NULL,
  invoice_number TEXT NULL,
  invoice_date DATE NULL,
  vendor TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.property_expense_items IS 'Expense line items per property; from OCR or manual.';

CREATE INDEX IF NOT EXISTS idx_property_expense_items_property_created
  ON public.property_expense_items(property_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_property_expense_items_document_id
  ON public.property_expense_items(document_id);

DROP TRIGGER IF EXISTS property_expense_items_updated_at ON public.property_expense_items;
CREATE TRIGGER property_expense_items_updated_at
  BEFORE UPDATE ON public.property_expense_items
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.property_expense_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_expense_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "property_expense_documents_select" ON public.property_expense_documents;
CREATE POLICY "property_expense_documents_select" ON public.property_expense_documents FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "property_expense_documents_insert" ON public.property_expense_documents;
CREATE POLICY "property_expense_documents_insert" ON public.property_expense_documents FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "property_expense_documents_update" ON public.property_expense_documents;
CREATE POLICY "property_expense_documents_update" ON public.property_expense_documents FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "property_expense_documents_delete" ON public.property_expense_documents;
CREATE POLICY "property_expense_documents_delete" ON public.property_expense_documents FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "property_expense_items_select" ON public.property_expense_items;
CREATE POLICY "property_expense_items_select" ON public.property_expense_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "property_expense_items_insert" ON public.property_expense_items;
CREATE POLICY "property_expense_items_insert" ON public.property_expense_items FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "property_expense_items_update" ON public.property_expense_items;
CREATE POLICY "property_expense_items_update" ON public.property_expense_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "property_expense_items_delete" ON public.property_expense_items;
CREATE POLICY "property_expense_items_delete" ON public.property_expense_items FOR DELETE TO authenticated USING (true);
