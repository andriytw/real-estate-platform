-- Migration: Add user management fields to profiles table
-- Adds email, first_name, last_name, and category_access for user management system

-- 1. Add email column (if it doesn't exist) - sync with auth.users.email
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Sync email from auth.users for existing profiles
UPDATE profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND (p.email IS NULL OR p.email != u.email);

-- 3. Add first_name and last_name columns (if they don't exist)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_name TEXT;

-- 4. Migrate existing name to first_name if name exists and first_name is null
UPDATE profiles 
SET first_name = name 
WHERE first_name IS NULL AND name IS NOT NULL;

-- 5. Add category_access column (JSONB array of category names)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS category_access JSONB DEFAULT '["properties", "facility", "accounting", "sales", "tasks"]'::jsonb;

-- 6. Set default category_access for existing users (all categories)
UPDATE profiles 
SET category_access = '["properties", "facility", "accounting", "sales", "tasks"]'::jsonb
WHERE category_access IS NULL;

-- 7. Create index for category_access queries
CREATE INDEX IF NOT EXISTS idx_profiles_category_access ON profiles USING GIN (category_access);

-- 8. Create index for email queries
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- 9. Add comments to columns
COMMENT ON COLUMN profiles.email IS 'User email (synced from auth.users)';
COMMENT ON COLUMN profiles.category_access IS 'Array of category names user can access: properties, facility, accounting, sales, tasks';

-- 10. Create function to sync email from auth.users when profile is created/updated
CREATE OR REPLACE FUNCTION sync_profile_email()
RETURNS TRIGGER AS $$
BEGIN
  -- Sync email from auth.users if email is not set or different
  IF NEW.email IS NULL OR NEW.email != (SELECT email FROM auth.users WHERE id = NEW.id) THEN
    SELECT email INTO NEW.email FROM auth.users WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. Create trigger to sync email on INSERT
DROP TRIGGER IF EXISTS sync_profile_email_on_insert ON profiles;
CREATE TRIGGER sync_profile_email_on_insert
  BEFORE INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION sync_profile_email();

-- 12. Create trigger to sync email on UPDATE (if email is NULL)
DROP TRIGGER IF EXISTS sync_profile_email_on_update ON profiles;
CREATE TRIGGER sync_profile_email_on_update
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  WHEN (NEW.email IS NULL OR NEW.email != OLD.email)
  EXECUTE FUNCTION sync_profile_email();

-- Verification query (uncomment to check):
-- SELECT id, name, first_name, last_name, email, category_access FROM profiles LIMIT 5;

