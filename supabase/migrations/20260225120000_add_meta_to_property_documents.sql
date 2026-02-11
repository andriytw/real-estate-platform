-- Add meta JSONB to property_documents and ensure type supports 'bk_abrechnung'
-- If type column is an enum, add value 'bk_abrechnung' only when it does not exist (pg_enum check).
-- If type is TEXT/VARCHAR, do nothing. Compatible with PG versions that lack ADD VALUE IF NOT EXISTS.

DO $$
DECLARE
  col_udt text;
  enum_oid oid;
  val_exists boolean;
BEGIN
  SELECT a.udt_name INTO col_udt
  FROM information_schema.columns a
  WHERE a.table_schema = 'public' AND a.table_name = 'property_documents' AND a.column_name = 'type';

  IF col_udt IS NULL OR col_udt IN ('text', 'varchar', 'character varying') THEN
    RETURN;
  END IF;

  SELECT t.oid INTO enum_oid FROM pg_type t WHERE t.typname = col_udt AND t.typtype = 'e';
  IF enum_oid IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (SELECT 1 FROM pg_enum e WHERE e.enumtypid = enum_oid AND e.enumlabel = 'bk_abrechnung') INTO val_exists;
  IF NOT val_exists THEN
    EXECUTE format('ALTER TYPE public.%I ADD VALUE %L', col_udt, 'bk_abrechnung');
  END IF;
END $$;

ALTER TABLE public.property_documents
  ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb;
