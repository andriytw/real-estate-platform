-- Property inventory from documents (OCR): separate from warehouse. Append-only per property.
-- No warehouse_stock, stock_movements, or warehouse_invoices involved.

CREATE TABLE IF NOT EXISTS public.property_inventory_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  file_url TEXT NULL,
  file_name TEXT NULL,
  file_hash TEXT NULL,
  invoice_number TEXT NULL,
  purchase_date DATE NULL,
  store TEXT NULL,
  ocr_raw JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.property_inventory_documents IS 'OCR import documents per property; no warehouse link.';

CREATE INDEX IF NOT EXISTS idx_property_inventory_documents_property_created
  ON public.property_inventory_documents(property_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_property_inventory_documents_property_file_hash
  ON public.property_inventory_documents(property_id, file_hash)
  WHERE file_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.property_inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  document_id UUID NULL REFERENCES public.property_inventory_documents(id) ON DELETE SET NULL,
  article TEXT NULL,
  name TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NULL,
  invoice_number TEXT NULL,
  purchase_date DATE NULL,
  store TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.property_inventory_items IS 'Inventory lines from OCR/document per property; append-only.';

CREATE INDEX IF NOT EXISTS idx_property_inventory_items_property_created
  ON public.property_inventory_items(property_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_property_inventory_items_document
  ON public.property_inventory_items(document_id);

DROP TRIGGER IF EXISTS property_inventory_items_updated_at ON public.property_inventory_items;
CREATE TRIGGER property_inventory_items_updated_at
  BEFORE UPDATE ON public.property_inventory_items
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.property_inventory_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_inventory_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "property_inventory_documents_select" ON public.property_inventory_documents;
CREATE POLICY "property_inventory_documents_select" ON public.property_inventory_documents FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "property_inventory_documents_insert" ON public.property_inventory_documents;
CREATE POLICY "property_inventory_documents_insert" ON public.property_inventory_documents FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "property_inventory_documents_update" ON public.property_inventory_documents;
CREATE POLICY "property_inventory_documents_update" ON public.property_inventory_documents FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "property_inventory_documents_delete" ON public.property_inventory_documents;
CREATE POLICY "property_inventory_documents_delete" ON public.property_inventory_documents FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "property_inventory_items_select" ON public.property_inventory_items;
CREATE POLICY "property_inventory_items_select" ON public.property_inventory_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "property_inventory_items_insert" ON public.property_inventory_items;
CREATE POLICY "property_inventory_items_insert" ON public.property_inventory_items FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "property_inventory_items_update" ON public.property_inventory_items;
CREATE POLICY "property_inventory_items_update" ON public.property_inventory_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "property_inventory_items_delete" ON public.property_inventory_items;
CREATE POLICY "property_inventory_items_delete" ON public.property_inventory_items FOR DELETE TO authenticated USING (true);
