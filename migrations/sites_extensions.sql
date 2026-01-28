-- Add columns to sites table to support AddSiteModal fields
ALTER TABLE sites ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS end_date date;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
ALTER TABLE sites ADD COLUMN IF NOT EXISTS planned_hours numeric DEFAULT 0;

-- Geofence Fields (Safety check)
ALTER TABLE sites ADD COLUMN IF NOT EXISTS lat double precision;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS lng double precision;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS radius numeric;
