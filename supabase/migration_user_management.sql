-- Migration: Add user management fields to profiles table
-- Adds first_name, last_name, and category_access for user management system

-- 1. Add first_name and last_name columns (if they don't exist)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_name TEXT;

-- 2. Migrate existing name to first_name if name exists and first_name is null
UPDATE profiles 
SET first_name = name 
WHERE first_name IS NULL AND name IS NOT NULL;

-- 3. Add category_access column (JSONB array of category names)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS category_access JSONB DEFAULT '["properties", "facility", "accounting", "sales", "tasks"]'::jsonb;

-- 4. Set default category_access for existing users (all categories)
UPDATE profiles 
SET category_access = '["properties", "facility", "accounting", "sales", "tasks"]'::jsonb
WHERE category_access IS NULL;

-- 5. Create index for category_access queries
CREATE INDEX IF NOT EXISTS idx_profiles_category_access ON profiles USING GIN (category_access);

-- 6. Add comment to column
COMMENT ON COLUMN profiles.category_access IS 'Array of category names user can access: properties, facility, accounting, sales, tasks';

-- Verification query (uncomment to check):
-- SELECT id, name, first_name, last_name, category_access FROM profiles LIMIT 5;

