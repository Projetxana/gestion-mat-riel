\set ON_ERROR_STOP on
-- Isolated PostgreSQL 17 fixture. No production data or credentials.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY, email text NOT NULL, email_confirmed_at timestamptz);
INSERT INTO auth.users VALUES
('00000000-0000-0000-0000-000000000001','member-a@example.test',now()),
('00000000-0000-0000-0000-000000000002','a@example.test',now()),
('00000000-0000-0000-0000-000000000003','b@example.test',now()),
('00000000-0000-0000-0000-000000000004','unrelated@example.test',now()),
('00000000-0000-0000-0000-000000000005','newhire@example.test',now());
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;

CREATE TABLE public.company_users(user_id uuid, company_id uuid, role text);
CREATE TABLE public.companies(id uuid PRIMARY KEY, name text, owner_user_id uuid, created_at timestamp);
CREATE TABLE public.sites(id bigint PRIMARY KEY, name text, company_id uuid);
CREATE TABLE public.tasks(id bigint PRIMARY KEY, name text NOT NULL, site_id bigint, company_id uuid, is_active boolean, created_at timestamptz);
CREATE TABLE public.company_info(id bigint PRIMARY KEY, name text, address text);
CREATE TABLE public.invites(id uuid PRIMARY KEY, company_id uuid, email text, token text, status text, created_at timestamp);
CREATE TABLE public.company_modules(id uuid PRIMARY KEY, company_id uuid, module_name text, is_active boolean);
CREATE TABLE public.bookings(id uuid PRIMARY KEY, source text, guest text);

INSERT INTO company_users VALUES
('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','member'),
('00000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','admin'),
('00000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','member');
INSERT INTO companies(id,name) VALUES
('10000000-0000-0000-0000-000000000001','A'),
('20000000-0000-0000-0000-000000000001','B');
INSERT INTO sites VALUES
(11,'Site A','10000000-0000-0000-0000-000000000001'),
(22,'Site B','20000000-0000-0000-0000-000000000001');
INSERT INTO tasks(id,name,site_id,company_id) VALUES (111,'Legacy A',11,NULL),(222,'Legacy B',22,NULL);
INSERT INTO company_info(id,name) VALUES (1,'Legacy global');
INSERT INTO invites(id,company_id,email) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','10000000-0000-0000-0000-000000000001','a@example.test'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','20000000-0000-0000-0000-000000000001','b@example.test');
INSERT INTO invites(id,company_id,email,token) VALUES
('ffffffff-ffff-ffff-ffff-ffffffffffff','10000000-0000-0000-0000-000000000001','newhire@example.test','test-token-newhire-123456789');
INSERT INTO company_modules(id,company_id,module_name) VALUES
('cccccccc-cccc-cccc-cccc-cccccccccccc','10000000-0000-0000-0000-000000000001','hours'),
('dddddddd-dddd-dddd-dddd-dddddddddddd','20000000-0000-0000-0000-000000000001','hours');
INSERT INTO bookings(id,guest) VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','Fictional');
ALTER TABLE public.company_info ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acces Total Public" ON public.company_info FOR ALL TO public USING (true) WITH CHECK (true);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated users" ON public.tasks FOR ALL TO public USING (auth.uid() IS NOT NULL);
CREATE POLICY "multi-tenant-safe" ON public.tasks FOR ALL TO public USING (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon,authenticated;

\ir ../docs/collective-hours/proposed-tenant-rls-hardening.sql
\ir ../docs/collective-hours/proposed-secure-invite.sql

-- Check the real PostgreSQL role/RLS implementation.
SET ROLE anon;
DO $$
BEGIN
 IF (SELECT count(*) FROM public.companies) <> 0 THEN RAISE EXCEPTION 'Anonymous companies exposed'; END IF;
 IF (SELECT count(*) FROM public.company_info) <> 0 THEN RAISE EXCEPTION 'Anonymous global company info exposed'; END IF;
 IF (SELECT count(*) FROM public.bookings) <> 0 THEN RAISE EXCEPTION 'Anonymous bookings exposed'; END IF;
END $$;
RESET ROLE;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
DO $$
BEGIN
 IF (SELECT count(*) FROM public.tasks) <> 1 THEN RAISE EXCEPTION 'Member A tasks scope broken'; END IF;
 IF (SELECT count(*) FROM public.companies) <> 1 THEN RAISE EXCEPTION 'Member A companies scope broken'; END IF;
 IF (SELECT count(*) FROM public.invites) <> 0 THEN RAISE EXCEPTION 'Member A invitation leakage'; END IF;
 IF (SELECT count(*) FROM public.company_modules) <> 1 THEN RAISE EXCEPTION 'Member A module scope broken'; END IF;
END $$;
RESET ROLE;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
SET ROLE authenticated;
DO $$
BEGIN
 IF (SELECT count(*) FROM public.invites) <> 2 THEN RAISE EXCEPTION 'Admin A invitation read broken'; END IF;
 IF (SELECT count(*) FROM public.tasks) <> 1 THEN RAISE EXCEPTION 'Admin A tasks scope broken'; END IF;
END $$;
RESET ROLE;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
SET ROLE authenticated;
DO $$
BEGIN
 IF (SELECT min(id) FROM public.tasks) <> 222 THEN RAISE EXCEPTION 'Member B tasks scope broken'; END IF;
 IF (SELECT count(*) FROM public.companies) <> 1 THEN RAISE EXCEPTION 'Member B companies scope broken'; END IF;
END $$;
RESET ROLE;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000004';
SET ROLE authenticated;
DO $$
BEGIN
 IF (SELECT count(*) FROM public.tasks) <> 0 THEN RAISE EXCEPTION 'Unrelated user sees tasks'; END IF;
 IF (SELECT count(*) FROM public.companies) <> 0 THEN RAISE EXCEPTION 'Unrelated user sees companies'; END IF;
END $$;
RESET ROLE;
SELECT 'PostgreSQL 17 tenant RLS checks passed' AS result;

-- Secure invite access: an unrelated authenticated user cannot consume another user's token.
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000004';
SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.bt_accept_invite_secure('test-token-newhire-123456789');
    RAISE EXCEPTION 'Unrelated user accepted invitation';
  EXCEPTION WHEN invalid_authorization_specification THEN
    NULL; -- Expected permission denial.
  END;
END $$;
RESET ROLE;
-- Exact addressed, email-verified user may consume once, with member role.
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000005';
SET ROLE authenticated;
SELECT public.bt_accept_invite_secure('test-token-newhire-123456789');
DO $$
BEGIN
  IF (SELECT count(*) FROM public.company_users
      WHERE user_id='00000000-0000-0000-0000-000000000005' AND role='member') <> 1 THEN
    RAISE EXCEPTION 'Invite did not add precisely one member';
  END IF;
  BEGIN
    PERFORM public.bt_accept_invite_secure('test-token-newhire-123456789');
    RAISE EXCEPTION 'Replayed invitation accepted';
  EXCEPTION WHEN invalid_authorization_specification THEN
    NULL;
  END;
END $$;
RESET ROLE;
SELECT 'Email-bound invite acceptance and replay checks passed' AS result;
