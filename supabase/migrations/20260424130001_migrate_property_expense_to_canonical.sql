-- One-time: copy legacy property_expense_documents (+ line items) into accounting_property_documents.
-- Idempotent. Files remain in bucket property-expense-docs; storage_bucket marks the correct bucket for signed URLs.

INSERT INTO public.accounting_property_documents (
  id,
  property_id,
  direction,
  category_id,
  document_type,
  storage_path,
  storage_bucket,
  file_name,
  mime,
  counterparty_name,
  invoice_no,
  invoice_date,
  due_date,
  amount_total,
  currency,
  processing_status,
  ocr_status,
  ocr_raw,
  ocr_error,
  notes,
  created_by,
  updated_by,
  created_at,
  updated_at,
  migrated_from_expense_document_id
)
SELECT
  gen_random_uuid(),
  d.property_id,
  'expense',
  (
    SELECT acc.id
    FROM public.property_expense_items i
    JOIN public.property_expense_categories pec ON pec.id = i.category_id
    JOIN public.accounting_document_categories acc
      ON acc.user_id = pec.user_id
     AND acc.direction = 'expense'
     AND acc.code = pec.code
    WHERE i.document_id = d.id
    ORDER BY i.created_at
    LIMIT 1
  ),
  'invoice',
  d.storage_path,
  'property-expense-docs',
  d.file_name,
  NULL,
  d.vendor,
  d.invoice_number,
  d.invoice_date,
  NULL,
  (
    SELECT COALESCE(SUM(COALESCE(i.line_total, i.quantity * i.unit_price, 0)), 0)::NUMERIC(14, 2)
    FROM public.property_expense_items i
    WHERE i.document_id = d.id
  ),
  'EUR',
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.property_expense_items i
      JOIN public.property_expense_categories pec ON pec.id = i.category_id
      JOIN public.accounting_document_categories acc
        ON acc.user_id = pec.user_id
       AND acc.direction = 'expense'
       AND acc.code = pec.code
      WHERE i.document_id = d.id
    ) THEN 'ready'
    ELSE 'draft'
  END,
  CASE WHEN d.ocr_raw IS NOT NULL THEN 'ok' ELSE 'idle' END,
  d.ocr_raw,
  NULL,
  'Migrated from legacy property_expense_documents',
  (
    SELECT pec.user_id
    FROM public.property_expense_items i
    JOIN public.property_expense_categories pec ON pec.id = i.category_id
    WHERE i.document_id = d.id
    ORDER BY i.created_at
    LIMIT 1
  ),
  (
    SELECT pec.user_id
    FROM public.property_expense_items i
    JOIN public.property_expense_categories pec ON pec.id = i.category_id
    WHERE i.document_id = d.id
    ORDER BY i.created_at
    LIMIT 1
  ),
  d.created_at,
  now(),
  d.id
FROM public.property_expense_documents d
WHERE NOT EXISTS (
  SELECT 1 FROM public.accounting_property_documents x
  WHERE x.migrated_from_expense_document_id = d.id
);

INSERT INTO public.accounting_property_document_lines (
  id,
  document_id,
  description,
  quantity,
  unit_price,
  vat,
  line_total,
  sort_order,
  created_at
)
SELECT
  gen_random_uuid(),
  a.id,
  i.name,
  i.quantity,
  i.unit_price,
  NULL,
  COALESCE(i.line_total, i.quantity * i.unit_price),
  (ROW_NUMBER() OVER (PARTITION BY i.document_id ORDER BY i.created_at))::INT - 1,
  i.created_at
FROM public.property_expense_items i
JOIN public.accounting_property_documents a ON a.migrated_from_expense_document_id = i.document_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.accounting_property_document_lines l
  WHERE l.document_id = a.id
);
