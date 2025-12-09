-- Migration: Add last_invite_sent_at column to profiles table
-- Tracks when the last invitation email was sent to a user

-- 1. Add last_invite_sent_at column (if it doesn't exist)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_invite_sent_at TIMESTAMPTZ;

-- 2. Add comment to column
COMMENT ON COLUMN profiles.last_invite_sent_at IS 'Timestamp of when the last invitation email was sent to this user';

-- 3. Create index for faster queries (optional, but useful for filtering users who haven't received invites)
CREATE INDEX IF NOT EXISTS idx_profiles_last_invite_sent_at ON profiles(last_invite_sent_at);

-- Verification query (uncomment to check):
-- SELECT id, email, name, last_invite_sent_at FROM profiles ORDER BY last_invite_sent_at DESC NULLS LAST LIMIT 10;

