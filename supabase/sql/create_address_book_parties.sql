-- SQL #2 — create_address_book_parties (run in Supabase SQL Editor)
CREATE TABLE IF NOT EXISTS public.address_book_parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'company1', 'company2', 'management')),
  name TEXT NOT NULL,
  iban TEXT NOT NULL DEFAULT '',
  street TEXT NOT NULL DEFAULT '',
  house_number TEXT,
  zip TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  country TEXT,
  phones TEXT[] NOT NULL DEFAULT '{}',
  emails TEXT[] NOT NULL DEFAULT '{}',
  payment_day INTEGER NULL CHECK (payment_day IS NULL OR (payment_day BETWEEN 1 AND 31)),
  unit_identifier TEXT,
  contact_person TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT address_book_parties_dedup_key UNIQUE (owner_user_id, role, name, iban, street, zip, city)
);

COMMENT ON TABLE public.address_book_parties IS 'Address Book: parties auto-captured from property card save. RLS by owner_user_id.';
COMMENT ON COLUMN public.address_book_parties.contact_person IS 'PIB contact person for owner/management.';

CREATE OR REPLACE FUNCTION public.set_address_book_parties_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS address_book_parties_updated_at ON public.address_book_parties;
CREATE TRIGGER address_book_parties_updated_at
  BEFORE UPDATE ON public.address_book_parties
  FOR EACH ROW EXECUTE PROCEDURE public.set_address_book_parties_updated_at();

ALTER TABLE public.address_book_parties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "address_book_parties_select_own" ON public.address_book_parties;
CREATE POLICY "address_book_parties_select_own"
  ON public.address_book_parties FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "address_book_parties_insert_own" ON public.address_book_parties;
CREATE POLICY "address_book_parties_insert_own"
  ON public.address_book_parties FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "address_book_parties_update_own" ON public.address_book_parties;
CREATE POLICY "address_book_parties_update_own"
  ON public.address_book_parties FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "address_book_parties_delete_own" ON public.address_book_parties;
CREATE POLICY "address_book_parties_delete_own"
  ON public.address_book_parties FOR DELETE TO authenticated
  USING (owner_user_id = auth.uid());
