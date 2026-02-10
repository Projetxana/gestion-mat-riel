-- 1. Table: weekly_timesheets
CREATE TABLE IF NOT EXISTS weekly_timesheets (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES profiles(id),
    week_start DATE,
    week_end DATE,
    leader_validated BOOLEAN DEFAULT FALSE,
    admin_validated BOOLEAN DEFAULT FALSE,
    leader_validated_at TIMESTAMP,
    admin_validated_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT now()
);

-- 2. Table: weekly_timesheet_entries
CREATE TABLE IF NOT EXISTS weekly_timesheet_entries (
    id BIGSERIAL PRIMARY KEY,
    timesheet_id BIGINT REFERENCES weekly_timesheets(id) ON DELETE CASCADE,
    site_id BIGINT,
    section_id BIGINT,
    hours NUMERIC(6,2),
    source TEXT CHECK (source IN ('punch','manual')),
    created_at TIMESTAMP DEFAULT now()
);

-- 3. Update profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS role TEXT CHECK (role IN ('admin','leader','worker','apprentice')) DEFAULT 'worker';
