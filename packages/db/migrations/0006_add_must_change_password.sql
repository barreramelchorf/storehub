-- Add must_change_password flag to users table
-- Default true for new users (they must change on first login)
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT true;

-- Set existing users to false (they already have their passwords set)
UPDATE users SET must_change_password = false WHERE must_change_password = true;
