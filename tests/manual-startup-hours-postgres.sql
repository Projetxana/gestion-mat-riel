\set ON_ERROR_STOP on
\ir purchases-rls-postgres.sql
\ir ../migrations/bt_site_manual_hours_20261123_PROPOSED.sql

DO $check$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='bt_site_manual_hour_policies' AND c.relrowsecurity)
 THEN RAISE EXCEPTION 'startup-hours policy missing RLS'; END IF;
 IF has_table_privilege('anon','public.bt_site_manual_hour_policies','SELECT')
 THEN RAISE EXCEPTION 'anonymous startup hour policy access'; END IF;
END $check$;

SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
SET ROLE authenticated;
INSERT INTO public.bt_site_manual_hour_policies
(site_id,company_id,manual_hours_distinct,updated_by)
VALUES (11,'10000000-0000-0000-0000-000000000001',true,auth.uid());
DO $check$
BEGIN
 IF (SELECT count(*) FROM public.bt_site_manual_hour_policies WHERE manual_hours_distinct)<>1
 THEN RAISE EXCEPTION 'Admin cannot confirm startup hours'; END IF;
END $check$;

-- A valid admin cannot forge a different tenant on a site that belongs to A.
SELECT public.bt_test_expect_error(
 $sql$INSERT INTO public.bt_site_manual_hour_policies
(site_id,company_id,manual_hours_distinct,updated_by)
VALUES(12,'20000000-0000-0000-0000-000000000001',true,auth.uid())$sql$,'42501');
RESET ROLE;

SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
DO $check$
BEGIN
 IF (SELECT count(*) FROM public.bt_site_manual_hour_policies)<>0
 THEN RAISE EXCEPTION 'Employee can read admin hour policy'; END IF;
END $check$;
SELECT public.bt_test_expect_error(
 $sql$INSERT INTO public.bt_site_manual_hour_policies
(site_id,company_id,manual_hours_distinct,updated_by)
VALUES(12,'10000000-0000-0000-0000-000000000001',true,auth.uid())$sql$,'42501');
RESET ROLE;

SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000006';
SET ROLE authenticated;
DO $check$
BEGIN
 IF (SELECT count(*) FROM public.bt_site_manual_hour_policies)<>0
 THEN RAISE EXCEPTION 'Other company can read hour baseline'; END IF;
END $check$;
RESET ROLE;

SELECT 'PASS: manual starting hours isolated from IPMO and protected across tenants' AS result;
