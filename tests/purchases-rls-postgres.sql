\set ON_ERROR_STOP on
-- Standalone fabricated PostgreSQL 17 database; no production data or secrets.
-- Execute AFTER creating an empty database (e.g. buildtrack_purchases_test).
DO $roles$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END
$roles$;

CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text NOT NULL);
INSERT INTO auth.users VALUES
 ('00000000-0000-0000-0000-000000000001','member-a@example.test'),
 ('00000000-0000-0000-0000-000000000002','admin-a@example.test'),
 ('00000000-0000-0000-0000-000000000003','member-b@example.test'),
 ('00000000-0000-0000-0000-000000000004','outsider@example.test'),
 ('00000000-0000-0000-0000-000000000006','admin-b@example.test');

CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth, public TO authenticated, anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;

CREATE TABLE public.companies (
 id uuid PRIMARY KEY,
 name text NOT NULL
);
CREATE TABLE public.sites (
 id bigint PRIMARY KEY,
 name text NOT NULL,
 company_id uuid NOT NULL REFERENCES public.companies(id),
 status text NOT NULL DEFAULT 'active'
);
CREATE TABLE public.company_users (
 user_id uuid NOT NULL,
 company_id uuid NOT NULL REFERENCES public.companies(id),
 role text NOT NULL
);
INSERT INTO public.companies VALUES
 ('10000000-0000-0000-0000-000000000001','Tenant A'),
 ('20000000-0000-0000-0000-000000000001','Tenant B');
INSERT INTO public.sites VALUES
 (11,'Site A','10000000-0000-0000-0000-000000000001','active'),
 (12,'Site A 2','10000000-0000-0000-0000-000000000001','active'),
 (22,'Site B','20000000-0000-0000-0000-000000000001','active'),
 (33,'Archive','10000000-0000-0000-0000-000000000001','archived');
INSERT INTO public.company_users VALUES
 ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','member'),
 ('00000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','admin'),
 ('00000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','member'),
 ('00000000-0000-0000-0000-000000000006','20000000-0000-0000-0000-000000000001','admin');

CREATE FUNCTION public.bt_stage2_is_admin(p_company uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
 SELECT (SELECT auth.uid()) IS NOT NULL AND p_company IS NOT NULL
 AND EXISTS (SELECT 1 FROM public.company_users cu
  WHERE cu.company_id=p_company AND cu.user_id=(SELECT auth.uid()) AND cu.role='admin')
$fn$;
REVOKE ALL ON FUNCTION public.bt_stage2_is_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bt_stage2_is_admin(uuid) TO authenticated;

ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
CREATE POLICY sites_tenant_select ON public.sites FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.company_users cu
 WHERE cu.user_id=(SELECT auth.uid()) AND cu.company_id=sites.company_id));
GRANT SELECT ON public.company_users TO authenticated;
GRANT SELECT ON public.sites TO authenticated;

-- Test-only helper. Each rejected statement is rolled back inside an exception subtransaction.
CREATE FUNCTION public.bt_test_expect_error(p_sql text, p_expected_state text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $fn$
DECLARE hit boolean := false;
BEGIN
 BEGIN
  EXECUTE p_sql;
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE = p_expected_state THEN hit := true;
  ELSE RAISE EXCEPTION 'Expected error %, got %: %', p_expected_state, SQLSTATE, SQLERRM;
  END IF;
 END;
 IF NOT hit THEN RAISE EXCEPTION 'Expected SQLSTATE % but operation succeeded: %',p_expected_state,p_sql; END IF;
END;
$fn$;
REVOKE ALL ON FUNCTION public.bt_test_expect_error(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bt_test_expect_error(text,text) TO authenticated, anon;

\ir ../migrations/bt_purchases_mvp1_PROPOSED.sql

-- Verify all financial tables deny anonymous updates, deletion and visibility.
DO $check$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY[
 'bt_purchase_budgets','bt_purchase_budget_lines','bt_purchase_orders','bt_purchase_order_lines'
 ] LOOP
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid
    WHERE n.nspname='public' AND c.relname=t AND c.relrowsecurity) THEN
   RAISE EXCEPTION 'No RLS: %',t;
  END IF;
  IF has_table_privilege('anon', 'public.'||t, 'SELECT')
   OR has_table_privilege('authenticated', 'public.'||t, 'UPDATE')
   OR has_table_privilege('authenticated', 'public.'||t, 'DELETE') THEN
   RAISE EXCEPTION 'Incorrect privileges: %',t;
  END IF;
 END LOOP;
END
$check$;

SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
SET ROLE authenticated;
-- Admin A can import a one-time baseline and order; amounts are pre-tax.
SELECT public.bt_purchase_import_budget(
 '10000000-0000-0000-0000-000000000001', 11, 'estimate-a.xlsx',
 '[{"item_code":"CD 00429","description":"Te CPVC 1","unit":"UN","quantity":40,"unit_cost":3.8,"amount":152.00},
   {"item_code":"CD 00159","description":"Tuyau CPVC 1","unit":"PI","quantity":200,"unit_cost":1.33,"amount":266.00}]'::jsonb);
SELECT public.bt_purchase_create_order(
 '10000000-0000-0000-0000-000000000001', 11, 'P02281','Flocor',
 '7252931','Site A','2026-11-20','flocor.xlsx',true,'',
 '[{"item_code":"ART00429","description":"Te CPVC","unit":"UN","quantity":20,"unit_cost":3.8,"amount":76}]'::jsonb);
DO $check$
BEGIN
 IF (SELECT count(*) FROM public.bt_purchase_budgets) <> 1 OR
    (SELECT sum(amount) FROM public.bt_purchase_budget_lines) <> 418.00 OR
    (SELECT count(*) FROM public.bt_purchase_orders) <> 1 OR
    (SELECT sum(amount) FROM public.bt_purchase_order_lines) <> 76.00
 THEN RAISE EXCEPTION 'Admin A baseline/PO import totals mismatch'; END IF;
END
$check$;
-- Duplicate initial budget is rejected (immutable).
SELECT public.bt_test_expect_error(
 $sql$SELECT public.bt_purchase_import_budget(
 '10000000-0000-0000-0000-000000000001',11,'repeat.xlsx',
 '[{"description":"One","unit":"UN","quantity":1,"unit_cost":1,"amount":1}]'::jsonb)$sql$, '23505');
-- A PO belongs to supplier + tenant, not to a single site; duplicates on other sites are rejected.
SELECT public.bt_test_expect_error(
 $sql$SELECT public.bt_purchase_create_order(
 '10000000-0000-0000-0000-000000000001',12,'P02281','FLOCOR',
 '7252931','Site A 2',null,'second.xlsx',true,'',
 '[{"description":"One","unit":"UN","quantity":1,"unit_cost":1,"amount":1}]'::jsonb)$sql$, '23505');
-- Wrong shipping site must be rejected without a clear typed override.
SELECT public.bt_test_expect_error(
 $sql$SELECT public.bt_purchase_create_order(
 '10000000-0000-0000-0000-000000000001',12,'P0999','Flocor',
 '7252999','Site B',null,'wrong-site.xlsx',true,'',
 '[{"description":"One","unit":"UN","quantity":1,"unit_cost":1,"amount":1}]'::jsonb)$sql$, 'P0001');
-- Even an admin cannot attach a tenant-B site to company A through a direct INSERT.
SELECT public.bt_test_expect_error(
 $sql$INSERT INTO public.bt_purchase_budgets(company_id,site_id,source_name,created_by)
 VALUES ('10000000-0000-0000-0000-000000000001',22,'forbidden.xlsx',
         '00000000-0000-0000-0000-000000000002')$sql$, '42501');
SELECT public.bt_test_expect_error(
 $sql$INSERT INTO public.bt_purchase_orders(
  company_id,site_id,po_number,supplier,shipping_project_name,project_verified_by)
 VALUES ('10000000-0000-0000-0000-000000000001',22,'P1337','Flocor','Site B',
         '00000000-0000-0000-0000-000000000002')$sql$, '42501');
-- Malformed rows roll back entire budget operation: no ghost baseline for site 12.
SELECT public.bt_test_expect_error(
 $sql$SELECT public.bt_purchase_import_budget(
 '10000000-0000-0000-0000-000000000001',12,'bad.xlsx',
 '[{"description":"Bad","unit":"UN","quantity":1,"unit_cost":1}]'::jsonb)$sql$, '23502');
DO $check$
BEGIN
 IF EXISTS (SELECT 1 FROM public.bt_purchase_budgets WHERE site_id=12)
 THEN RAISE EXCEPTION 'Invalid CSV generated ghost baseline'; END IF;
END
$check$;
SELECT public.bt_purchase_import_budget(
 '10000000-0000-0000-0000-000000000001',12,'good.xlsx',
 '[{"description":"Good","unit":"UN","quantity":2,"unit_cost":4,"amount":8}]'::jsonb);
-- A correctly and explicitly overridden project name is accepted but stays traceable.
SELECT public.bt_purchase_create_order(
 '10000000-0000-0000-0000-000000000001',12,'P0999','Flocor',
 '7252999','Site A alias',null,'override.xlsx',true,'Site A 2',
 '[{"description":"One","unit":"UN","quantity":1,"unit_cost":1,"amount":1}]'::jsonb);
RESET ROLE;

-- A member sees no purchase pricing even within their own company.
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
DO $check$
BEGIN
 IF (SELECT count(*) FROM public.bt_purchase_budgets) <> 0 OR
    (SELECT count(*) FROM public.bt_purchase_budget_lines) <> 0 OR
    (SELECT count(*) FROM public.bt_purchase_orders) <> 0 OR
    (SELECT count(*) FROM public.bt_purchase_order_lines) <> 0 THEN
     RAISE EXCEPTION 'Tenant A employee can read prices'; END IF;
END
$check$;
SELECT public.bt_test_expect_error(
 $sql$SELECT public.bt_purchase_import_budget(
 '10000000-0000-0000-0000-000000000001',33,'member.xlsx',
 '[{"description":"One","unit":"UN","quantity":1,"unit_cost":1,"amount":1}]'::jsonb)$sql$, '42501');
SELECT public.bt_test_expect_error(
 $sql$INSERT INTO public.bt_purchase_budgets(company_id,site_id,source_name,created_by)
 VALUES ('10000000-0000-0000-0000-000000000001',33,'member.xlsx',
         '00000000-0000-0000-0000-000000000001')$sql$, '42501');
RESET ROLE;

-- Tenant B admin can import within B but must not see A pricing.
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000006';
SET ROLE authenticated;
DO $check$
BEGIN
 IF (SELECT count(*) FROM public.bt_purchase_budgets) <> 0 THEN
  RAISE EXCEPTION 'Tenant B admin can read tenant A costs'; END IF;
END
$check$;
SELECT public.bt_test_expect_error(
 $sql$SELECT public.bt_purchase_import_budget(
 '10000000-0000-0000-0000-000000000001',12,'B-write-to-A.xlsx',
 '[{"description":"One","unit":"UN","quantity":1,"unit_cost":1,"amount":1}]'::jsonb)$sql$, '42501');
SELECT public.bt_purchase_import_budget(
 '20000000-0000-0000-0000-000000000001',22,'B.xlsx',
 '[{"description":"One","unit":"UN","quantity":10,"unit_cost":2,"amount":20}]'::jsonb);
SELECT public.bt_purchase_create_order(
 '20000000-0000-0000-0000-000000000001',22,'P02281','Flocor',
 'B-order','Site B',null,'B-order.xlsx',true,'',
 '[{"description":"One","unit":"UN","quantity":2,"unit_cost":2,"amount":4}]'::jsonb);
DO $check$
BEGIN
 IF (SELECT count(*) FROM public.bt_purchase_budgets) <> 1 OR
    (SELECT count(*) FROM public.bt_purchase_orders) <> 1 THEN
  RAISE EXCEPTION 'Tenant B leakage or import failure'; END IF;
END
$check$;
RESET ROLE;

-- Anonymous has no access even with the spoofed UUID claim.
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
SET ROLE anon;
SELECT public.bt_test_expect_error(
 $sql$SELECT count(*) FROM public.bt_purchase_budgets$sql$, '42501');
RESET ROLE;
SELECT 'PASS: purchase SQL, cross-tenant/admin vs employee RLS, atomic imports, duplicate PO, shipping-project checks' AS result;
