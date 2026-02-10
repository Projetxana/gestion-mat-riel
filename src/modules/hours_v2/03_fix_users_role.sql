-- Fix users table role constraint
-- The original init script targeted 'profiles', but we use 'users'.

-- 1. Drop existing check if present
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

-- 2. Add new check allowing new roles
ALTER TABLE users ADD CONSTRAINT users_role_check 
    CHECK (role IN ('admin', 'user', 'leader', 'worker', 'apprentice'));

-- 3. Update comments/defaults if needed
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'worker';
