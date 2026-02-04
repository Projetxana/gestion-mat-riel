-- Migration: Fix time_sessions to use project_tasks FK
-- Date: 2026-02-04
-- Purpose: Link time_sessions to project_tasks.id instead of legacy TEXT task_id

-- 1. Rename old column (preserve data for potential recovery)
ALTER TABLE public.time_sessions 
RENAME COLUMN task_id TO task_id_legacy;

-- 2. Add new column with proper FK constraint
ALTER TABLE public.time_sessions
ADD COLUMN section_id BIGINT REFERENCES public.project_tasks(id) ON DELETE SET NULL;

-- 3. Attempt to migrate existing data
-- If task_id_legacy contains numeric IDs that correspond to project_tasks:
UPDATE public.time_sessions ts
SET section_id = CAST(ts.task_id_legacy AS BIGINT)
WHERE ts.task_id_legacy ~ '^[0-9]+$'
  AND EXISTS (
    SELECT 1 FROM public.project_tasks pt 
    WHERE pt.id = CAST(ts.task_id_legacy AS BIGINT)
  );

-- 4. Verify migration results
-- Run this to check:
-- SELECT 
--   COUNT(*) as total_sessions,
--   COUNT(section_id) as migrated_sessions,
--   COUNT(task_id_legacy) - COUNT(section_id) as unmigrated_sessions
-- FROM public.time_sessions;

-- 5. Optional: After verification, drop old column
-- Uncomment after confirming migration worked:
-- ALTER TABLE public.time_sessions DROP COLUMN task_id_legacy;

-- 6. Create index for performance
CREATE INDEX IF NOT EXISTS idx_time_sessions_section_id 
ON public.time_sessions(section_id);

-- 7. Create index for site_id (if not exists)
CREATE INDEX IF NOT EXISTS idx_time_sessions_site_id 
ON public.time_sessions(site_id);
