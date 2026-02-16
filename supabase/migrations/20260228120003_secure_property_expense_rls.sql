-- Secure RLS for property expense documents/items and storage bucket property-expense-docs.
-- Production-safe: properties may have NO user_id column yet (error 42703). We add it first,
-- then create policies that reference p.user_id. Ownership: p.user_id = auth.uid().

-- 0) Ensure properties.user_id exists (ownership). MUST run before any policy uses p.user_id.
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS user_id uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'properties_user_id_fkey'
  ) THEN
    ALTER TABLE public.properties
      ADD CONSTRAINT properties_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS properties_user_id_idx ON public.properties(user_id);

ALTER TABLE public.properties
  ALTER COLUMN user_id SET DEFAULT auth.uid();

-- 1) Only after step 0, create policies that reference p.user_id. Drop existing expense policies, then create strict ones.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'property_expense_documents'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.property_expense_documents', r.policyname);
  END LOOP;

  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'property_expense_items'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.property_expense_items', r.policyname);
  END LOOP;
END $$;

ALTER TABLE public.property_expense_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_expense_items ENABLE ROW LEVEL SECURITY;

-- 2) Create strict policies for documents (own property only)
CREATE POLICY expense_docs_select_own_property
ON public.property_expense_documents
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.properties p
    WHERE p.id = property_id
      AND p.user_id = auth.uid()
  )
);

CREATE POLICY expense_docs_insert_own_property
ON public.property_expense_documents
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.properties p
    WHERE p.id = property_id
      AND p.user_id = auth.uid()
  )
);

CREATE POLICY expense_docs_update_own_property
ON public.property_expense_documents
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.properties p
    WHERE p.id = property_id
      AND p.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.properties p
    WHERE p.id = property_id
      AND p.user_id = auth.uid()
  )
);

CREATE POLICY expense_docs_delete_own_property
ON public.property_expense_documents
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.properties p
    WHERE p.id = property_id
      AND p.user_id = auth.uid()
  )
);

-- 3) Create strict policies for items (own property only)
CREATE POLICY expense_items_select_own_property
ON public.property_expense_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.properties p
    WHERE p.id = property_id
      AND p.user_id = auth.uid()
  )
);

CREATE POLICY expense_items_insert_own_property
ON public.property_expense_items
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.properties p
    WHERE p.id = property_id
      AND p.user_id = auth.uid()
  )
);

CREATE POLICY expense_items_update_own_property
ON public.property_expense_items
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.properties p
    WHERE p.id = property_id
      AND p.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.properties p
    WHERE p.id = property_id
      AND p.user_id = auth.uid()
  )
);

CREATE POLICY expense_items_delete_own_property
ON public.property_expense_items
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.properties p
    WHERE p.id = property_id
      AND p.user_id = auth.uid()
  )
);

-- 4) Storage: drop ONLY policies for bucket property-expense-docs (by known policy names)
DROP POLICY IF EXISTS "property_expense_docs_read" ON storage.objects;
DROP POLICY IF EXISTS "property_expense_docs_upload" ON storage.objects;
DROP POLICY IF EXISTS "property_expense_docs_delete" ON storage.objects;

-- 5) Storage: strict policies for bucket property-expense-docs; path must be property/{propertyId}/... and property owned by auth.uid()
CREATE POLICY storage_read_property_expense_docs_own_property
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'property-expense-docs'
  AND split_part(name, '/', 1) = 'property'
  AND EXISTS (
    SELECT 1
    FROM public.properties p
    WHERE p.id::text = split_part(name, '/', 2)
      AND p.user_id = auth.uid()
  )
);

CREATE POLICY storage_upload_property_expense_docs_own_property
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'property-expense-docs'
  AND split_part(name, '/', 1) = 'property'
  AND EXISTS (
    SELECT 1
    FROM public.properties p
    WHERE p.id::text = split_part(name, '/', 2)
      AND p.user_id = auth.uid()
  )
);

CREATE POLICY storage_delete_property_expense_docs_own_property
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'property-expense-docs'
  AND split_part(name, '/', 1) = 'property'
  AND EXISTS (
    SELECT 1
    FROM public.properties p
    WHERE p.id::text = split_part(name, '/', 2)
      AND p.user_id = auth.uid()
  )
);
