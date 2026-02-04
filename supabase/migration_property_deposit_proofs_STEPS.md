# Міграція property_deposit_proofs — покроково

Виконуй у Supabase → SQL Editor по черзі: вставляй блок, натискай Run, перевіряй "Success", потім наступний крок.

---

## Крок 1. Таблиця

```sql
CREATE TABLE IF NOT EXISTS public.property_deposit_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  proof_type TEXT NOT NULL CHECK (proof_type IN ('payment', 'return')),
  bucket TEXT NOT NULL,
  file_path TEXT NOT NULL,
  original_filename TEXT,
  mime_type TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## Крок 2. Індекс

```sql
CREATE INDEX IF NOT EXISTS idx_property_deposit_proofs_property_type_created
  ON public.property_deposit_proofs(property_id, proof_type, created_at DESC);
```

---

## Крок 3. Коментар (необовʼязково)

```sql
COMMENT ON TABLE public.property_deposit_proofs IS 'Kaution (deposit) proof files only. Independent from property_documents. Used by Card 1 Застава block.';
```

---

## Крок 4. Увімкнути RLS

```sql
ALTER TABLE public.property_deposit_proofs ENABLE ROW LEVEL SECURITY;
```

---

## Крок 5. Політика SELECT

```sql
DROP POLICY IF EXISTS "property_deposit_proofs_select_via_property" ON public.property_deposit_proofs;
CREATE POLICY "property_deposit_proofs_select_via_property"
  ON public.property_deposit_proofs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = property_deposit_proofs.property_id
    )
  );
```

---

## Крок 6. Політика INSERT

```sql
DROP POLICY IF EXISTS "property_deposit_proofs_insert_via_property" ON public.property_deposit_proofs;
CREATE POLICY "property_deposit_proofs_insert_via_property"
  ON public.property_deposit_proofs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = property_deposit_proofs.property_id
    )
  );
```

---

## Крок 7. Політика DELETE

```sql
DROP POLICY IF EXISTS "property_deposit_proofs_delete_via_property" ON public.property_deposit_proofs;
CREATE POLICY "property_deposit_proofs_delete_via_property"
  ON public.property_deposit_proofs FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = property_deposit_proofs.property_id
    )
  );
```

---

Готово. Після всіх 7 кроків таблиця `property_deposit_proofs` створена з RLS і політиками.
