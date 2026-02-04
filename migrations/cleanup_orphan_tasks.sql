-- Migration: Cleanup Orphan Tasks
-- Deletes any task in 'tasks' or 'project_tasks' that does not have a valid project_id.

-- 1. Clean up 'project_tasks' (The new standard)
DELETE FROM project_tasks 
WHERE project_id IS NULL;

-- 2. Clean up 'tasks' (Legacy table, if it exists and is used)
-- We check if the table exists first to avoid errors, 
-- but in Supabase SQL editor we might just run the DELETE.
-- Assuming 'tasks' table exists:
DELETE FROM tasks 
WHERE site_id IS NULL AND project_id IS NULL;
