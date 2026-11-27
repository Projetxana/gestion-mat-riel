-- Proposed production migration. Validate on an isolated PostgreSQL branch
-- before applying; does not rewrite or delete existing historical entries.
-- Manual weekly rows share a synthetic 08:00 start: cross-task overlap is valid.
-- Prevent new overlapping manual rows on the same employee/company/site/task.
-- Serialized for normal READ COMMITTED PostgREST inserts (including bulk inserts).
BEGIN;
CREATE OR REPLACE FUNCTION public.bt_guard_manual_time_overlap()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = ''
AS $fn$
BEGIN
  IF NEW.manual_entry IS DISTINCT FROM TRUE OR NEW.company_id IS NULL
      OR NEW.user_id IS NULL OR NEW.site_id IS NULL OR NEW.section_id IS NULL
      OR NEW.punch_start_at IS NULL OR NEW.punch_end_at IS NULL
      OR NEW.punch_end_at <= NEW.punch_start_at THEN
    RETURN NEW;
  END IF;

  -- Keep authorization/RLS in force. Serialize concurrent inserts for the same
  -- employee and tenant, independent of the site or task.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW.company_id::text || ':' || NEW.user_id, 0)
  );

  IF EXISTS (
    SELECT 1 FROM public.time_sessions s
    WHERE s.company_id = NEW.company_id
      AND s.user_id = NEW.user_id
      AND s.site_id = NEW.site_id AND s.section_id = NEW.section_id
      AND s.manual_entry IS TRUE
      AND coalesce(s.corrected_start_at, s.punch_start_at) < NEW.punch_end_at
      AND coalesce(s.corrected_end_at, s.punch_end_at) > NEW.punch_start_at
      AND coalesce(s.corrected_end_at, s.punch_end_at) >
          coalesce(s.corrected_start_at, s.punch_start_at)
  ) THEN
    RAISE EXCEPTION 'BT_MANUAL_OVERLAP: des heures existent déjà sur cette tâche pour cette période.'
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.bt_guard_manual_time_overlap() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS bt_time_session_manual_overlap_guard ON public.time_sessions;
CREATE TRIGGER bt_time_session_manual_overlap_guard
  BEFORE INSERT ON public.time_sessions FOR EACH ROW
  EXECUTE FUNCTION public.bt_guard_manual_time_overlap();
COMMIT;
