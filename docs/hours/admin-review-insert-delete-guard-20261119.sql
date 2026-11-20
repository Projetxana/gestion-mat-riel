-- Block already approved hours from being deleted by employees.
-- The tenant's administrator retains their existing DELETE privilege.
DROP POLICY IF EXISTS bt_stage2_time_delete_own ON public.time_sessions;
CREATE POLICY bt_stage2_time_delete_own ON public.time_sessions
  FOR DELETE TO authenticated USING (
    public.bt_stage2_is_member(company_id)
    AND user_id = (SELECT auth.uid())::text
    AND approved IS DISTINCT FROM true
  );

-- Validate new records at INSERT time as well, so employees cannot mark a
-- self-submitted session approved in their original INSERT payload.
CREATE OR REPLACE FUNCTION public.bt_guard_time_session_insert()
RETURNS trigger LANGUAGE plpgsql
SET search_path = ''
AS $body$
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL
     AND NOT public.bt_stage2_is_admin(NEW.company_id) THEN
    NEW.approved := false;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.correction_reason := NULL;
    NEW.corrected_start_at := NULL;
    NEW.corrected_end_at := NULL;
  END IF;
  RETURN NEW;
END;
$body$;
DROP TRIGGER IF EXISTS bt_time_session_insert_guard ON public.time_sessions;
CREATE TRIGGER bt_time_session_insert_guard
  BEFORE INSERT ON public.time_sessions
  FOR EACH ROW EXECUTE FUNCTION public.bt_guard_time_session_insert();
REVOKE EXECUTE ON FUNCTION public.bt_guard_time_session_insert() FROM PUBLIC, anon, authenticated;
