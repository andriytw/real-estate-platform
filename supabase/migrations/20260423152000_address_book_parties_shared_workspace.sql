-- Make address_book_parties a shared internal workspace list for managers + super_manager.
-- owner_user_id remains creator/audit only (not a visibility scope).
--
-- Phase 2 (DB): dedupe existing rows, add stable dedupe_key + UNIQUE, and broaden RLS read/write for managers.

-- 1) Add a dedupe_key (fingerprint) so we can enforce global uniqueness
-- NOTE: We avoid a GENERATED column here because Supabase/Postgres can reject generation expressions
-- as non-IMMUTABLE depending on extensions/collation. We use a trigger instead.
ALTER TABLE public.address_book_parties
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

CREATE OR REPLACE FUNCTION public.address_book_parties_compute_dedupe_key(
  in_role TEXT,
  in_name TEXT,
  in_iban TEXT,
  in_street TEXT,
  in_house_number TEXT,
  in_zip TEXT,
  in_city TEXT,
  in_country TEXT
)
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT md5(
    concat_ws(
      '|',
      coalesce(in_role, ''),
      lower(trim(coalesce(in_name, ''))),
      upper(translate(coalesce(in_iban, ''), E' \t\n\r\f\v', '')),
      lower(trim(coalesce(in_street, ''))),
      lower(trim(coalesce(in_house_number, ''))),
      lower(trim(coalesce(in_zip, ''))),
      lower(trim(coalesce(in_city, ''))),
      lower(trim(coalesce(in_country, '')))
    )
  );
$$;

-- Backfill existing rows
UPDATE public.address_book_parties ab
SET dedupe_key = public.address_book_parties_compute_dedupe_key(
  ab.role,
  ab.name,
  ab.iban,
  ab.street,
  ab.house_number,
  ab.zip,
  ab.city,
  ab.country
)
WHERE ab.dedupe_key IS NULL OR btrim(ab.dedupe_key) = '';

CREATE OR REPLACE FUNCTION public.address_book_parties_set_dedupe_key()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.dedupe_key := public.address_book_parties_compute_dedupe_key(
    NEW.role,
    NEW.name,
    NEW.iban,
    NEW.street,
    NEW.house_number,
    NEW.zip,
    NEW.city,
    NEW.country
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS address_book_parties_set_dedupe_key ON public.address_book_parties;
CREATE TRIGGER address_book_parties_set_dedupe_key
  BEFORE INSERT OR UPDATE ON public.address_book_parties
  FOR EACH ROW
  EXECUTE FUNCTION public.address_book_parties_set_dedupe_key();

-- 2) Best-effort merge for duplicates before enforcing uniqueness
-- Merge phones/emails into the canonical row (earliest created_at), then delete the extra rows.
WITH dup_groups AS (
  SELECT
    dedupe_key,
    (array_agg(id ORDER BY created_at ASC, id ASC))[1] AS keep_id,
    array_agg(id) AS all_ids
  FROM public.address_book_parties
  GROUP BY dedupe_key
  HAVING COUNT(*) > 1
),
merged AS (
  SELECT
    g.keep_id,
    (
      SELECT array_agg(DISTINCT p) FROM (
        SELECT unnest(coalesce(ab.phones, ARRAY[]::TEXT[])) AS p
        FROM public.address_book_parties ab
        WHERE ab.id = ANY (g.all_ids)
      ) x
      WHERE x.p IS NOT NULL AND btrim(x.p) <> ''
    ) AS phones_merged,
    (
      SELECT array_agg(DISTINCT e) FROM (
        SELECT unnest(coalesce(ab.emails, ARRAY[]::TEXT[])) AS e
        FROM public.address_book_parties ab
        WHERE ab.id = ANY (g.all_ids)
      ) x
      WHERE x.e IS NOT NULL AND btrim(x.e) <> ''
    ) AS emails_merged
  FROM dup_groups g
)
UPDATE public.address_book_parties k
SET
  phones = COALESCE(merged.phones_merged, k.phones),
  emails = COALESCE(merged.emails_merged, k.emails)
FROM merged
WHERE k.id = merged.keep_id;

WITH dup_groups AS (
  SELECT
    dedupe_key,
    (array_agg(id ORDER BY created_at ASC, id ASC))[1] AS keep_id,
    array_agg(id) AS all_ids
  FROM public.address_book_parties
  GROUP BY dedupe_key
  HAVING COUNT(*) > 1
)
DELETE FROM public.address_book_parties d
USING dup_groups g
WHERE d.id = ANY (g.all_ids)
  AND d.id <> g.keep_id;

-- 3) Replace old per-user uniqueness with shared uniqueness
ALTER TABLE public.address_book_parties
  DROP CONSTRAINT IF EXISTS address_book_parties_dedup_key;

ALTER TABLE public.address_book_parties
  ALTER COLUMN dedupe_key SET NOT NULL;

ALTER TABLE public.address_book_parties
  ADD CONSTRAINT address_book_parties_dedupe_key_unique UNIQUE (dedupe_key);

-- 4) Ensure owner_user_id remains audit-only (immutable on UPDATE)
CREATE OR REPLACE FUNCTION public.address_book_parties_preserve_owner_user_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.owner_user_id := OLD.owner_user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS address_book_parties_preserve_owner_user_id ON public.address_book_parties;
CREATE TRIGGER address_book_parties_preserve_owner_user_id
  BEFORE UPDATE ON public.address_book_parties
  FOR EACH ROW
  EXECUTE FUNCTION public.address_book_parties_preserve_owner_user_id();

-- 5) RLS: managers + super_manager can read/write shared list; others keep own-row access
ALTER TABLE public.address_book_parties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS address_book_parties_select_own ON public.address_book_parties;
DROP POLICY IF EXISTS address_book_parties_insert_own ON public.address_book_parties;
DROP POLICY IF EXISTS address_book_parties_update_own ON public.address_book_parties;
DROP POLICY IF EXISTS address_book_parties_delete_own ON public.address_book_parties;

-- Read: managers can read all; non-managers can read own rows
CREATE POLICY address_book_parties_select_shared_for_managers
  ON public.address_book_parties FOR SELECT TO authenticated
  USING (public.is_manager());

CREATE POLICY address_book_parties_select_own_fallback
  ON public.address_book_parties FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid());

-- Insert: creator must be auth.uid(); managers allowed (they are authenticated)
CREATE POLICY address_book_parties_insert_creator_only
  ON public.address_book_parties FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid());

-- Update/Delete: managers can manage all; non-managers only own rows
CREATE POLICY address_book_parties_update_shared_for_managers
  ON public.address_book_parties FOR UPDATE TO authenticated
  USING (public.is_manager() OR owner_user_id = auth.uid())
  WITH CHECK (public.is_manager() OR owner_user_id = auth.uid());

CREATE POLICY address_book_parties_delete_shared_for_managers
  ON public.address_book_parties FOR DELETE TO authenticated
  USING (public.is_manager() OR owner_user_id = auth.uid());

