-- 1. Add site_id to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS site_id BIGINT REFERENCES sites(id);

-- 2. Duplicate existing "Global" tasks for EACH existing Site
-- This ensures every site starts with the standard list, but independent.
INSERT INTO tasks (name, site_id)
SELECT t.name, s.id
FROM sites s
CROSS JOIN (
    -- Get the list of unique task names currently in the system (Templates)
    SELECT DISTINCT name FROM tasks WHERE site_id IS NULL
) t
WHERE s.status = 'active' -- Only for active sites to be clean
AND NOT EXISTS (
    -- Avoid duplicates if run multiple times
    SELECT 1 FROM tasks existing
    WHERE existing.site_id = s.id AND existing.name = t.name
);

-- 3. (Optional) Verify
-- SELECT * FROM tasks ORDER BY site_id;
