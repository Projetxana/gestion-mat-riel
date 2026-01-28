-- Add planned_hours to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS planned_hours INTEGER DEFAULT 0;
