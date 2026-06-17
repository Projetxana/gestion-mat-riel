-- ==============================================================================
-- Migration: Fix data isolation for TestFlight
-- 
-- PROBLEM: All existing data has company_id = NULL because of the
-- currentCompanyId bug (was never initialized in the frontend).
-- The RLS policies currently allow "company_id IS NULL" as a wildcard,
-- meaning ALL users (including new signups) can see ALL legacy data.
--
-- FIX:
-- 1. Assign your company_id to all existing NULL data
-- 2. Tighten RLS policies to remove the NULL wildcard
-- ==============================================================================

-- STEP 1: Find your company ID
-- Run this first to get your company_id:
-- SELECT id, name FROM companies;
-- Replace YOUR_COMPANY_ID below with the actual number.

-- STEP 2: Assign your company to all orphaned data
-- Replace 1 with your actual company_id from step 1

UPDATE sites SET company_id = 1 WHERE company_id IS NULL;
UPDATE materials SET company_id = 1 WHERE company_id IS NULL;
UPDATE logs SET company_id = 1 WHERE company_id IS NULL;
UPDATE time_sessions SET company_id = 1 WHERE company_id IS NULL;
UPDATE project_tasks SET company_id = 1 WHERE company_id IS NULL;
UPDATE users SET company_id = 1 WHERE company_id IS NULL;

-- STEP 3: Add company_id column to users table if missing
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS company_id BIGINT REFERENCES public.companies(id) ON DELETE CASCADE;

-- STEP 4: Tighten RLS — Remove the "company_id IS NULL" wildcard
-- New users will now ONLY see data from their own company.

DROP POLICY IF EXISTS "Sites isolation" ON public.sites;
CREATE POLICY "Sites isolation" ON public.sites
  FOR ALL USING (
    company_id = public.get_user_company_id()
  );

DROP POLICY IF EXISTS "Materials isolation" ON public.materials;
CREATE POLICY "Materials isolation" ON public.materials
  FOR ALL USING (
    company_id = public.get_user_company_id()
  );

DROP POLICY IF EXISTS "Logs isolation" ON public.logs;
CREATE POLICY "Logs isolation" ON public.logs
  FOR ALL USING (
    company_id = public.get_user_company_id()
  );

DROP POLICY IF EXISTS "Tasks isolation" ON public.tasks;
CREATE POLICY "Tasks isolation" ON public.tasks
  FOR ALL USING (
    company_id = public.get_user_company_id()
  );

DROP POLICY IF EXISTS "Time sessions isolation" ON public.time_sessions;
CREATE POLICY "Time sessions isolation" ON public.time_sessions
  FOR ALL USING (
    company_id = public.get_user_company_id()
  );

DROP POLICY IF EXISTS "Project tasks isolation" ON public.project_tasks;
CREATE POLICY "Project tasks isolation" ON public.project_tasks
  FOR ALL USING (
    company_id = public.get_user_company_id()
  );

-- STEP 5: Also tighten INSERT policies so new data MUST have a company_id
-- (This prevents the frontend from inserting NULL company_id again)

DROP POLICY IF EXISTS "Sites insert" ON public.sites;
CREATE POLICY "Sites insert" ON public.sites
  FOR INSERT WITH CHECK (
    company_id = public.get_user_company_id()
  );

DROP POLICY IF EXISTS "Materials insert" ON public.materials;
CREATE POLICY "Materials insert" ON public.materials
  FOR INSERT WITH CHECK (
    company_id = public.get_user_company_id()
  );

DROP POLICY IF EXISTS "Logs insert" ON public.logs;
CREATE POLICY "Logs insert" ON public.logs
  FOR INSERT WITH CHECK (
    company_id = public.get_user_company_id()
  );

DROP POLICY IF EXISTS "Time sessions insert" ON public.time_sessions;
CREATE POLICY "Time sessions insert" ON public.time_sessions
  FOR INSERT WITH CHECK (
    company_id = public.get_user_company_id()
  );

DROP POLICY IF EXISTS "Project tasks insert" ON public.project_tasks;
CREATE POLICY "Project tasks insert" ON public.project_tasks
  FOR INSERT WITH CHECK (
    company_id = public.get_user_company_id()
  );
