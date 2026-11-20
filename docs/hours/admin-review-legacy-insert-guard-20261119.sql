-- Security hardening for the historical weekly-timesheet workflow.
-- Members may create their own draft snapshot but cannot pre-approve it on INSERT.
CREATE OR REPLACE FUNCTION public.bt_guard_legacy_weekly_insert()
RETURNS trigger LANGUAGE plpgsql
SET search_path = ''
AS $body$
BEGIN
 IF (SELECT auth.uid()) IS NOT NULL AND NOT public.bt_stage2_is_admin(NEW.company_id) THEN
   NEW.leader_validated := false;
   NEW.leader_validated_at := null;
   NEW.admin_validated := false;
   NEW.admin_validated_at := null;
 END IF;
 RETURN NEW;
END;
$body$;
DROP TRIGGER IF EXISTS bt_legacy_weekly_insert_guard ON public.weekly_timesheets;
CREATE TRIGGER bt_legacy_weekly_insert_guard BEFORE INSERT ON public.weekly_timesheets
FOR EACH ROW EXECUTE FUNCTION public.bt_guard_legacy_weekly_insert();
REVOKE EXECUTE ON FUNCTION public.bt_guard_legacy_weekly_insert() FROM PUBLIC,anon,authenticated;
