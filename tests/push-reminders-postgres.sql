\set ON_ERROR_STOP on
-- Dedicated database fixture. No network, real employees, or credentials.
DO $fixture$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $fixture$;
-- Isolated CI cluster only.
ALTER ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth,public TO authenticated,anon,service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon,service_role;
CREATE TABLE public.companies(id uuid PRIMARY KEY);
CREATE TABLE public.company_users(company_id uuid,user_id uuid,role text);
CREATE TABLE public.time_sessions(id bigint PRIMARY KEY,company_id uuid,user_id text,
  punch_start_at timestamptz,punch_end_at timestamptz,corrected_start_at timestamptz,corrected_end_at timestamptz);
-- Mirror the production membership contract; production functions are not replaced.
CREATE FUNCTION public.bt_stage2_is_member(cid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.company_users WHERE company_id=cid AND user_id=auth.uid());
$$;
CREATE FUNCTION public.bt_stage2_is_admin(cid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.company_users WHERE company_id=cid AND user_id=auth.uid() AND role='admin');
$$;
ALTER TABLE public.company_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY company_members_read ON public.company_users FOR SELECT TO authenticated
 USING(user_id=auth.uid() OR public.bt_stage2_is_admin(company_id));
GRANT SELECT ON public.company_users TO authenticated;
GRANT SELECT ON public.company_users,public.time_sessions TO service_role;

INSERT INTO auth.users VALUES
 ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),
 ('00000000-0000-0000-0000-000000000003'),('00000000-0000-0000-0000-000000000004');
INSERT INTO public.companies VALUES ('10000000-0000-0000-0000-000000000001'),('20000000-0000-0000-0000-000000000001');
INSERT INTO public.company_users VALUES
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','admin'),
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','member'),
 ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','member'),
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','member');

\ir ../docs/push-reminders/schema-PROPOSED.sql

SET ROLE authenticated;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
INSERT INTO public.bt_push_settings(company_id,enabled) VALUES ('10000000-0000-0000-0000-000000000001',true);
INSERT INTO public.bt_push_roster(company_id,user_id) VALUES
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002'),
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004');
DO $$ BEGIN
 BEGIN
   INSERT INTO public.bt_push_roster(company_id,user_id) VALUES ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003');
   RAISE EXCEPTION 'Foreign employee enrolled';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   INSERT INTO public.bt_push_settings(company_id,enabled) VALUES ('20000000-0000-0000-0000-000000000001',true);
   RAISE EXCEPTION 'Foreign settings writable';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
UPDATE public.bt_push_roster SET enrolled_at='2026-01-01T00:00:00Z';

SET ROLE authenticated;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
INSERT INTO public.bt_push_subscriptions(company_id,user_id,endpoint) VALUES
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','https://web.push.apple.com/test-device-2');
INSERT INTO public.bt_push_subscriptions(company_id,user_id,endpoint) VALUES
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','https://web.push.apple.com/test-device-2')
 ON CONFLICT(endpoint) DO UPDATE SET company_id=excluded.company_id,user_id=excluded.user_id,endpoint=excluded.endpoint;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.bt_push_subscriptions)<>1 THEN RAISE EXCEPTION 'Own subscription missing'; END IF;
 IF (SELECT count(*) FROM public.bt_push_settings)<>0 THEN RAISE EXCEPTION 'Settings leaked'; END IF;
 IF (SELECT count(*) FROM public.bt_push_roster)<>0 THEN RAISE EXCEPTION 'Roster leaked'; END IF;
 BEGIN PERFORM public.bt_push_due('2026-11-26T23:00:00Z');
   RAISE EXCEPTION 'Member executed scheduler'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  INSERT INTO public.bt_push_subscriptions(company_id,user_id,endpoint) VALUES
   ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','https://web.push.apple.com/foreign-tenant');
  RAISE EXCEPTION 'Cross-tenant subscription'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  INSERT INTO public.bt_push_subscriptions(company_id,user_id,endpoint) VALUES
   ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','https://web.push.apple.com.evil.test/invalid');
  RAISE EXCEPTION 'SSRF endpoint accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000004';
INSERT INTO public.bt_push_subscriptions(company_id,user_id,endpoint) VALUES
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','https://fcm.googleapis.com/device-4');
DO $$ BEGIN
 BEGIN
  INSERT INTO public.bt_push_subscriptions(company_id,user_id,endpoint) VALUES
   ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','https://web.push.apple.com/test-device-2')
   ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id;
  RAISE EXCEPTION 'Endpoint hijacked'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

SET ROLE authenticated;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
DO $$ BEGIN
 IF (SELECT count(*) FROM public.bt_push_subscriptions)<>0 THEN RAISE EXCEPTION 'Admin sees private endpoints'; END IF;
END $$;
INSERT INTO public.bt_push_absences(company_id,user_id,start_date,end_date) VALUES
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','2026-11-23','2026-11-27');
RESET ROLE;

SET ROLE service_role;
DO $$ DECLARE candidate record; BEGIN
 IF (SELECT count(*) FROM public.bt_push_due('2026-11-26T22:59:00Z'))<>0 THEN RAISE EXCEPTION 'Early reminder'; END IF;
 IF (SELECT count(*) FROM public.bt_push_due('2026-11-26T23:00:00Z'))<>1 THEN RAISE EXCEPTION 'Winter timezone or absence selection failed'; END IF;
 IF (SELECT count(*) FROM public.bt_push_due('2026-07-23T22:00:00Z'))<>2 THEN RAISE EXCEPTION 'Summer timezone failed'; END IF;
 IF (SELECT count(*) FROM public.bt_push_due('2026-11-28T23:00:00Z'))<>0 THEN RAISE EXCEPTION 'Weekend reminder'; END IF;
 SELECT * INTO candidate FROM public.bt_push_due('2026-11-26T23:00:00Z');
 IF (SELECT count(*) FROM public.bt_push_claim(candidate.subscription_id,'daily','2026-11-26','2026-11-26T23:01:00Z'))<>1 THEN RAISE EXCEPTION 'Claim failed'; END IF;
 IF (SELECT count(*) FROM public.bt_push_claim(candidate.subscription_id,'daily','2026-11-26','2026-11-26T23:02:00Z'))<>0 THEN RAISE EXCEPTION 'Duplicate claim'; END IF;
 IF (SELECT count(*) FROM public.bt_push_due('2026-11-28T00:00:00Z') WHERE kind='weekly')<>1 THEN RAISE EXCEPTION 'Friday missing-day reminder failed'; END IF;
END $$;
RESET ROLE;
-- A completed session, an open punch, an absence, and a fully completed week.
INSERT INTO public.time_sessions VALUES
 (1,'10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','2026-11-23T13:00Z','2026-11-23T22:00Z',NULL,NULL),
 (2,'10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','2026-11-24T13:00Z','2026-11-24T22:00Z',NULL,NULL),
 (3,'10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','2026-11-25T13:00Z','2026-11-25T22:00Z',NULL,NULL),
 (4,'10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','2026-11-26T13:00Z','2026-11-26T22:00Z',NULL,NULL),
 (5,'10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','2026-11-27T13:00Z',NULL,NULL,NULL);
SET ROLE service_role;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.bt_push_due('2026-11-27T23:00:00Z'))<>0 THEN RAISE EXCEPTION 'Open punch triggered reminder'; END IF;
 IF (SELECT count(*) FROM public.bt_push_due('2026-11-28T00:00:00Z'))<>0 THEN RAISE EXCEPTION 'Complete/absent week reminded'; END IF;
 IF (SELECT count(*) FROM public.bt_push_due('2026-11-24T23:00:00Z'))<>0 THEN RAISE EXCEPTION 'Completed day reminded'; END IF;
END $$;
RESET ROLE;
DELETE FROM public.company_users WHERE user_id='00000000-0000-0000-0000-000000000002';
SET ROLE service_role;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.bt_push_due('2026-07-23T22:00Z') WHERE user_id='00000000-0000-0000-0000-000000000002') THEN RAISE EXCEPTION 'Former member reminded'; END IF;
END $$;
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
DO $$ BEGIN
 IF (SELECT count(*) FROM public.bt_push_history)<>1 THEN RAISE EXCEPTION 'Admin history missing'; END IF;
 BEGIN UPDATE public.bt_push_history SET status='accepted'; RAISE EXCEPTION 'Admin forged history';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
DO $$ BEGIN
 IF (SELECT count(*) FROM public.bt_push_history)<>0 THEN RAISE EXCEPTION 'Foreign history leaked'; END IF;
 IF (SELECT count(*) FROM public.bt_push_subscriptions)<>0 THEN RAISE EXCEPTION 'Foreign endpoints leaked'; END IF;
END $$;
RESET ROLE;
SET ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM public.bt_push_due(now()); RAISE EXCEPTION 'Anonymous scheduler access';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT 'Push reminder scheduling, privacy and RLS tests passed' AS result;

-- V2: collective exclusions and independent switches; fixture only.
\ir ../docs/push-reminders/schema-v2-collective-exclusions.sql
DELETE FROM public.bt_push_roster;
UPDATE public.bt_push_subscriptions SET created_at='2026-01-01T00:00Z';
UPDATE public.bt_push_settings SET daily_enabled=false,weekly_enabled=true;
SET ROLE service_role;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.bt_push_due('2026-11-26T23:00Z')) THEN RAISE EXCEPTION 'Disabled daily sent'; END IF;
 IF (SELECT count(*) FROM public.bt_push_due('2026-11-28T00:00Z'))<>1 THEN RAISE EXCEPTION 'Weekly-only without roster failed'; END IF;
END $$;
RESET ROLE;
UPDATE public.bt_push_settings SET daily_enabled=true,weekly_enabled=false;
SET ROLE service_role;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.bt_push_due('2026-11-26T23:00Z'))<>1 THEN RAISE EXCEPTION 'Daily-only without roster failed'; END IF;
 IF EXISTS(SELECT 1 FROM public.bt_push_due('2026-11-28T00:00Z')) THEN RAISE EXCEPTION 'Disabled weekly sent'; END IF;
END $$;
RESET ROLE;
UPDATE public.bt_push_settings SET daily_enabled=false,weekly_enabled=false;
SET ROLE service_role;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.bt_push_due('2026-11-26T23:00Z')) OR EXISTS(SELECT 1 FROM public.bt_push_due('2026-11-28T00:00Z')) THEN RAISE EXCEPTION 'Both disabled sent'; END IF;
END $$;
RESET ROLE;
UPDATE public.bt_push_settings SET daily_enabled=true,weekly_enabled=true;
SET ROLE authenticated;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
INSERT INTO public.bt_push_exclusions(company_id,start_date,end_date,label) VALUES
 ('10000000-0000-0000-0000-000000000001','2026-11-23','2026-11-27','Winter closure'),
 ('10000000-0000-0000-0000-000000000001','2026-07-20','2026-07-24','Summer closure');
DO $$ BEGIN
 BEGIN
 INSERT INTO public.bt_push_exclusions(company_id,start_date,end_date) VALUES ('20000000-0000-0000-0000-000000000001','2026-11-23','2026-11-27');
 RAISE EXCEPTION 'Foreign closure writable'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET ROLE service_role;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.bt_push_due('2026-11-26T23:00Z')) OR EXISTS(SELECT 1 FROM public.bt_push_due('2026-11-28T00:00Z')) OR EXISTS(SELECT 1 FROM public.bt_push_due('2026-07-23T22:00Z')) THEN RAISE EXCEPTION 'Collective closure ignored'; END IF;
END $$;
RESET ROLE;
SELECT 'Independent schedules and collective exclusions passed' AS result;
