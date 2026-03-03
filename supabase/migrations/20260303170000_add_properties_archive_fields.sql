-- Property archive (soft delete) for 2-step deletion flow.
-- Active = archived_at IS NULL, Archived = archived_at IS NOT NULL.

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS archived_by uuid NULL REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS properties_archived_at_idx ON public.properties(archived_at);
