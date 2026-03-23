-- Pass 1: additive access-model columns on profiles (non-breaking).
-- Does NOT auto-map legacy department = 'general' to department_scope = 'all' (general stays unresolved until admin sets scope).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS department_scope TEXT,
  ADD COLUMN IF NOT EXISTS can_manage_users BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_be_task_assignee BOOLEAN DEFAULT true;

COMMENT ON COLUMN public.profiles.department_scope IS 'Business access scope: facility|accounting|sales|properties|all. Legacy department column mirrored for RLS; see app sync rules.';
COMMENT ON COLUMN public.profiles.can_manage_users IS 'User management / admin UI capability (separate from super_manager role).';
COMMENT ON COLUMN public.profiles.can_be_task_assignee IS 'When true and active, user may appear in task assignee lists.';

-- Backfill scope from legacy department only for CHECK-safe values (not general / not null widening to all).
UPDATE public.profiles
SET department_scope = department
WHERE department_scope IS NULL
  AND department IN ('facility', 'accounting', 'sales');

-- Existing super_managers retain user-management access until changed in UI.
UPDATE public.profiles
SET can_manage_users = true
WHERE role = 'super_manager';

UPDATE public.profiles
SET can_be_task_assignee = true
WHERE can_be_task_assignee IS NULL;
