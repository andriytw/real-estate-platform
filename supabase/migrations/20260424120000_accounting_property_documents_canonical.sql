-- Phase 1: Canonical property accounting documents (intake) — single table + categories + line items shell.
-- Not mixed with public.invoices (sales).

CREATE TABLE IF NOT EXISTS public.accounting_document_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('expense', 'income')),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, direction, code)
);

CREATE INDEX IF NOT EXISTS idx_accounting_document_categories_user_direction
  ON public.accounting_document_categories(user_id, direction, is_active, sort_order);

DROP TRIGGER IF EXISTS accounting_document_categories_updated_at ON public.accounting_document_categories;
CREATE TRIGGER accounting_document_categories_updated_at
  BEFORE UPDATE ON public.accounting_document_categories
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.accounting_document_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "accounting_document_categories_select" ON public.accounting_document_categories;
CREATE POLICY "accounting_document_categories_select"
  ON public.accounting_document_categories FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "accounting_document_categories_insert" ON public.accounting_document_categories;
CREATE POLICY "accounting_document_categories_insert"
  ON public.accounting_document_categories FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "accounting_document_categories_update" ON public.accounting_document_categories;
CREATE POLICY "accounting_document_categories_update"
  ON public.accounting_document_categories FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "accounting_document_categories_delete" ON public.accounting_document_categories;
CREATE POLICY "accounting_document_categories_delete"
  ON public.accounting_document_categories FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.accounting_property_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NULL REFERENCES public.properties(id) ON DELETE SET NULL,
  direction TEXT NOT NULL DEFAULT 'expense' CHECK (direction IN ('expense', 'income')),
  category_id UUID NULL REFERENCES public.accounting_document_categories(id) ON DELETE SET NULL,
  document_type TEXT NOT NULL DEFAULT 'invoice' CHECK (document_type IN ('invoice', 'receipt', 'other')),
  storage_path TEXT NOT NULL,
  file_name TEXT NULL,
  mime TEXT NULL,
  counterparty_name TEXT NULL,
  invoice_no TEXT NULL,
  invoice_date DATE NULL,
  due_date DATE NULL,
  amount_total NUMERIC(14, 2) NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  processing_status TEXT NOT NULL DEFAULT 'draft' CHECK (processing_status IN ('draft', 'ready')),
  notes TEXT NULL,
  created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accounting_property_docs_property_status
  ON public.accounting_property_documents(property_id, processing_status, created_at DESC)
  WHERE property_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_property_docs_direction_status
  ON public.accounting_property_documents(direction, processing_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_accounting_property_docs_created_by
  ON public.accounting_property_documents(created_by, created_at DESC);

DROP TRIGGER IF EXISTS accounting_property_documents_updated_at ON public.accounting_property_documents;
CREATE TRIGGER accounting_property_documents_updated_at
  BEFORE UPDATE ON public.accounting_property_documents
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.accounting_property_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "accounting_property_documents_select" ON public.accounting_property_documents;
CREATE POLICY "accounting_property_documents_select"
  ON public.accounting_property_documents FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "accounting_property_documents_insert" ON public.accounting_property_documents;
CREATE POLICY "accounting_property_documents_insert"
  ON public.accounting_property_documents FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "accounting_property_documents_update" ON public.accounting_property_documents;
CREATE POLICY "accounting_property_documents_update"
  ON public.accounting_property_documents FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "accounting_property_documents_delete" ON public.accounting_property_documents;
CREATE POLICY "accounting_property_documents_delete"
  ON public.accounting_property_documents FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.accounting_property_document_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.accounting_property_documents(id) ON DELETE CASCADE,
  description TEXT NULL,
  quantity NUMERIC(14, 4) NULL,
  unit_price NUMERIC(14, 2) NULL,
  vat NUMERIC(14, 2) NULL,
  line_total NUMERIC(14, 2) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accounting_property_doc_lines_document
  ON public.accounting_property_document_lines(document_id, sort_order);

ALTER TABLE public.accounting_property_document_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "accounting_property_document_lines_select" ON public.accounting_property_document_lines;
CREATE POLICY "accounting_property_document_lines_select"
  ON public.accounting_property_document_lines FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "accounting_property_document_lines_insert" ON public.accounting_property_document_lines;
CREATE POLICY "accounting_property_document_lines_insert"
  ON public.accounting_property_document_lines FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "accounting_property_document_lines_update" ON public.accounting_property_document_lines;
CREATE POLICY "accounting_property_document_lines_update"
  ON public.accounting_property_document_lines FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "accounting_property_document_lines_delete" ON public.accounting_property_document_lines;
CREATE POLICY "accounting_property_document_lines_delete"
  ON public.accounting_property_document_lines FOR DELETE TO authenticated USING (true);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'accounting-property-docs',
  'accounting-property-docs',
  false,
  20971520,
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

DROP POLICY IF EXISTS "accounting_property_docs_read" ON storage.objects;
CREATE POLICY "accounting_property_docs_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'accounting-property-docs');
DROP POLICY IF EXISTS "accounting_property_docs_upload" ON storage.objects;
CREATE POLICY "accounting_property_docs_upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'accounting-property-docs');
DROP POLICY IF EXISTS "accounting_property_docs_delete" ON storage.objects;
CREATE POLICY "accounting_property_docs_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'accounting-property-docs');
