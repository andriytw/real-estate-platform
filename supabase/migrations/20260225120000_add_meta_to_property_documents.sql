-- Add meta JSONB to property_documents and ensure type supports 'bk_abrechnung'
-- If type column is an enum, add value 'bk_abrechnung'; if TEXT, no change.

DO $$
DECLARE
  col_udt text;
BEGIN
  SELECT a.udt_name INTO col_udt
  FROM information_schema.columns a
  WHERE a.table_schema = 'public' AND a.table_name = 'property_documents' AND a.column_name = 'type';

  IF col_udt IS NOT NULL AND col_udt NOT IN ('text', 'varchar', 'character varying') THEN
    EXECUTE format('ALTER TYPE public.%I ADD VALUE IF NOT EXISTS %L', col_udt, 'bk_abrechnung');
  END IF;
END $$;

ALTER TABLE public.property_documents
  ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb;
