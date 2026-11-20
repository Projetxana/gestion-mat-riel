-- BuildTrack: restrict approval and after-the-fact timesheet corrections to
-- a verified company administrator. Keep recorded punch times immutable.
-- Existing employee entry and the initial end-of-day punch remain supported.

ALTER TABLE public.time_sessions
  ADD COLUMN IF NOT EXISTS correction_reason text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

CREATE TABLE IF NOT EXISTS public.bt_time_session_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id bigint NOT NULL,
  company_id uuid NOT NULL,
  actor_id uuid,
  action text NOT NULL CHECK (action IN ('corrected','approved','approval_reset')),
  reason text,
  before_values jsonb NOT NULL,
  after_values jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bt_session_audit_by_session
 ON public.bt_time_session_audit(company_id, session_id, created_at DESC);

ALTER TABLE public.bt_time_session_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY bt_session_audit_admin_read ON public.bt_time_session_audit
  FOR SELECT TO authenticated
  USING (public.bt_stage2_is_admin(company_id));
REVOKE ALL ON public.bt_time_session_audit FROM anon, authenticated, PUBLIC;
GRANT SELECT ON public.bt_time_session_audit TO authenticated;

CREATE OR REPLACE FUNCTION public.bt_guard_time_session_review()
RETURNS trigger LANGUAGE plpgsql
SET search_path = ''
AS $body$
DECLARE
  is_admin boolean := public.bt_stage2_is_admin(OLD.company_id);
  is_correction boolean;
  allowed_first_close boolean;
BEGIN
  -- Rows always remain in their original employee/company.
  IF OLD.company_id IS DISTINCT FROM NEW.company_id OR
     OLD.user_id IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'L identité de l employé et de l entreprise ne peut pas changer.'
      USING ERRCODE = '42501';
  END IF;

  is_correction :=
      OLD.corrected_start_at IS DISTINCT FROM NEW.corrected_start_at
   OR OLD.corrected_end_at IS DISTINCT FROM NEW.corrected_end_at
   OR OLD.site_id IS DISTINCT FROM NEW.site_id
   OR OLD.section_id IS DISTINCT FROM NEW.section_id;

  -- A companion may enter a corrected finishing time during their ORIGINAL
  -- end-of-day punch; later corrections are strictly administrator-only.
  allowed_first_close :=
      OLD.punch_end_at IS NULL
      AND NEW.punch_end_at IS NOT NULL
      AND OLD.corrected_start_at IS NOT DISTINCT FROM NEW.corrected_start_at
      AND OLD.site_id IS NOT DISTINCT FROM NEW.site_id
      AND OLD.section_id IS NOT DISTINCT FROM NEW.section_id
      AND OLD.approved IS NOT DISTINCT FROM NEW.approved;

  IF (SELECT auth.uid()) IS NOT NULL AND NOT is_admin THEN
    IF OLD.approved IS DISTINCT FROM NEW.approved
       OR OLD.reviewed_by IS DISTINCT FROM NEW.reviewed_by
       OR OLD.reviewed_at IS DISTINCT FROM NEW.reviewed_at
       OR OLD.correction_reason IS DISTINCT FROM NEW.correction_reason
       OR (OLD.punch_end_at IS NOT NULL AND (
           OLD.punch_start_at IS DISTINCT FROM NEW.punch_start_at
           OR OLD.punch_end_at IS DISTINCT FROM NEW.punch_end_at))
       OR (is_correction AND NOT (
            allowed_first_close
            AND OLD.corrected_end_at IS DISTINCT FROM NEW.corrected_end_at
            AND OLD.corrected_start_at IS NOT DISTINCT FROM NEW.corrected_start_at
       ))
    THEN
      RAISE EXCEPTION 'Seul un administrateur de cette entreprise peut corriger ou valider les heures.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF is_correction AND is_admin AND (SELECT auth.uid()) IS NOT NULL THEN
    IF NEW.correction_reason IS NULL OR length(btrim(NEW.correction_reason)) < 3 THEN
      RAISE EXCEPTION 'Un motif de correction de 3 caractères minimum est requis.'
        USING ERRCODE = '22023';
    END IF;
    NEW.approved := false;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
  END IF;

  IF NEW.approved IS TRUE AND OLD.approved IS DISTINCT FROM NEW.approved THEN
    IF NEW.punch_end_at IS NULL THEN
      RAISE EXCEPTION 'Une session ouverte ne peut pas être validée.' USING ERRCODE = '22023';
    END IF;
    IF NOT is_admin AND (SELECT auth.uid()) IS NOT NULL THEN
      RAISE EXCEPTION 'Validation réservée aux administrateurs.' USING ERRCODE = '42501';
    END IF;
    NEW.reviewed_by := auth.uid();
    NEW.reviewed_at := now();
  END IF;

  RETURN NEW;
END;
$body$;

DROP TRIGGER IF EXISTS bt_time_session_review_guard ON public.time_sessions;
CREATE TRIGGER bt_time_session_review_guard
  BEFORE UPDATE ON public.time_sessions
  FOR EACH ROW EXECUTE FUNCTION public.bt_guard_time_session_review();

CREATE OR REPLACE FUNCTION public.bt_audit_time_session_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $body$
DECLARE
  changed_details boolean;
  event_name text;
BEGIN
  changed_details :=
      OLD.corrected_start_at IS DISTINCT FROM NEW.corrected_start_at
   OR OLD.corrected_end_at IS DISTINCT FROM NEW.corrected_end_at
   OR OLD.site_id IS DISTINCT FROM NEW.site_id
   OR OLD.section_id IS DISTINCT FROM NEW.section_id;
  IF NOT changed_details AND OLD.approved IS NOT DISTINCT FROM NEW.approved THEN
    RETURN NEW;
  END IF;
  event_name := CASE
    WHEN changed_details THEN 'corrected'
    WHEN NEW.approved IS TRUE THEN 'approved'
    ELSE 'approval_reset' END;
  INSERT INTO public.bt_time_session_audit
    (session_id, company_id, actor_id, action, reason, before_values, after_values)
  VALUES (
    NEW.id, NEW.company_id, auth.uid(), event_name,
    CASE WHEN changed_details THEN NEW.correction_reason ELSE NULL END,
    jsonb_build_object(
      'punch_start_at',OLD.punch_start_at,
      'punch_end_at',OLD.punch_end_at,
      'corrected_start_at',OLD.corrected_start_at,
      'corrected_end_at',OLD.corrected_end_at,
      'site_id',OLD.site_id,'section_id',OLD.section_id,
      'approved',OLD.approved
    ),
    jsonb_build_object(
      'punch_start_at',NEW.punch_start_at,
      'punch_end_at',NEW.punch_end_at,
      'corrected_start_at',NEW.corrected_start_at,
      'corrected_end_at',NEW.corrected_end_at,
      'site_id',NEW.site_id,'section_id',NEW.section_id,
      'approved',NEW.approved
    )
  );
  RETURN NEW;
END;
$body$;

DROP TRIGGER IF EXISTS bt_time_session_review_audit ON public.time_sessions;
CREATE TRIGGER bt_time_session_review_audit
  AFTER UPDATE ON public.time_sessions
  FOR EACH ROW EXECUTE FUNCTION public.bt_audit_time_session_review();

-- The old weekly approval tables must not provide a backdoor around the
-- new admin-only validation policy. Their snapshot generation remains usable.
CREATE OR REPLACE FUNCTION public.bt_guard_legacy_weekly_validation()
RETURNS trigger LANGUAGE plpgsql
SET search_path = ''
AS $body$
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL AND NOT public.bt_stage2_is_admin(OLD.company_id) AND (
      OLD.leader_validated IS DISTINCT FROM NEW.leader_validated
   OR OLD.admin_validated IS DISTINCT FROM NEW.admin_validated
   OR OLD.leader_validated_at IS DISTINCT FROM NEW.leader_validated_at
   OR OLD.admin_validated_at IS DISTINCT FROM NEW.admin_validated_at
  ) THEN
    RAISE EXCEPTION 'La validation hebdomadaire est réservée aux administrateurs.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$body$;

DROP TRIGGER IF EXISTS bt_legacy_weekly_validation_guard ON public.weekly_timesheets;
CREATE TRIGGER bt_legacy_weekly_validation_guard
  BEFORE UPDATE ON public.weekly_timesheets
  FOR EACH ROW EXECUTE FUNCTION public.bt_guard_legacy_weekly_validation();

REVOKE EXECUTE ON FUNCTION public.bt_audit_time_session_review() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bt_guard_time_session_review() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bt_guard_legacy_weekly_validation() FROM PUBLIC, anon, authenticated;
