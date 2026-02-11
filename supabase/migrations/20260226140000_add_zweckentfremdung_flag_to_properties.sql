-- Zweckentfremdung flag and optional updated_at for properties (Zweckentfremdungsverbot / complaint notice)
ALTER TABLE public.properties
ADD COLUMN IF NOT EXISTS zweckentfremdung_flag boolean NOT NULL DEFAULT false;

ALTER TABLE public.properties
ADD COLUMN IF NOT EXISTS zweckentfremdung_updated_at timestamptz;
