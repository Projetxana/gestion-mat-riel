\set ON_ERROR_STOP on
\ir purchases-rls-postgres.sql
\ir ../migrations/bt_purchase_line_links_20261123_PROPOSED.sql

DO $check$
BEGIN
 IF NOT EXISTS(
  SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='bt_purchase_line_links' AND c.relrowsecurity
 ) THEN RAISE EXCEPTION 'Reconciliation RLS not enabled'; END IF;
 IF has_table_privilege('anon','public.bt_purchase_line_links','SELECT')
 THEN RAISE EXCEPTION 'Anonymous can see confidential purchase links'; END IF;
END $check$;

SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
SET ROLE authenticated;
SELECT public.bt_purchase_create_order(
 '10000000-0000-0000-0000-000000000001',11,'P09998','Flocor',
 'pilot','Site A',null,'new-vendor.xlsx',true,'',
 '[{"item_code":"P10GV2","description":"Tuyau 1 fournisseur","unit":"FT","quantity":20,"unit_cost":2,"amount":40}]'::jsonb
);
-- The vendor's P10GV2 code is genuinely different from the CD 00159 code.
INSERT INTO public.bt_purchase_line_links(order_line_id,budget_line_id,company_id,site_id,disposition,created_by)
SELECT o.id,b.id,o.company_id,o.site_id,'linked',auth.uid()
FROM public.bt_purchase_order_lines o
JOIN public.bt_purchase_orders po ON po.id=o.order_id
JOIN public.bt_purchase_budget_lines b ON b.site_id=o.site_id
WHERE po.po_number='P09998' AND b.item_code='CD 00159';
DO $check$
BEGIN
 IF (SELECT count(*) FROM public.bt_purchase_line_links WHERE disposition='linked')<>1
 THEN RAISE EXCEPTION 'Company A admin cannot link legitimate vendor code'; END IF;
 IF (SELECT sum(amount) FROM public.bt_purchase_order_lines WHERE site_id=11)<>116
 THEN RAISE EXCEPTION 'Link changed order costs'; END IF;
END $check$;

-- Refuse attempt to pair incompatible UN vs FT units.
SELECT public.bt_test_expect_error(
 $sql$INSERT INTO public.bt_purchase_line_links(order_line_id,budget_line_id,company_id,site_id,disposition,created_by)
 SELECT o.id,b.id,o.company_id,o.site_id,'linked',auth.uid()
 FROM public.bt_purchase_order_lines o
 JOIN public.bt_purchase_orders po ON po.id=o.order_id
 JOIN public.bt_purchase_budget_lines b ON b.site_id=o.site_id
 WHERE po.po_number='P02281' AND b.item_code='CD 00159'$sql$,'42501');

-- Refuse cross-site budget mapping even for the same company.
SELECT public.bt_test_expect_error(
 $sql$INSERT INTO public.bt_purchase_line_links(order_line_id,budget_line_id,company_id,site_id,disposition,created_by)
 SELECT o.id,b.id,o.company_id,o.site_id,'linked',auth.uid()
 FROM public.bt_purchase_order_lines o
 JOIN public.bt_purchase_orders po ON po.id=o.order_id
 JOIN public.bt_purchase_budget_lines b ON b.site_id=12
 WHERE po.po_number='P02281' AND b.description='Good'$sql$,'42501');

-- Existing saved association may be changed into an outside-estimate purchase.
UPDATE public.bt_purchase_line_links
SET budget_line_id=NULL,disposition='outside_budget'
WHERE site_id=11;
DO $check$
BEGIN
 IF (SELECT count(*) FROM public.bt_purchase_line_links WHERE disposition='outside_budget')<>1
 THEN RAISE EXCEPTION 'Admin unable to mark purchased extra'; END IF;
END $check$;
RESET ROLE;

SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
DO $check$
BEGIN
 IF (SELECT count(*) FROM public.bt_purchase_line_links)<>0
 THEN RAISE EXCEPTION 'Employee can see supplier mapping'; END IF;
END $check$;
SELECT public.bt_test_expect_error(
 $sql$INSERT INTO public.bt_purchase_line_links(order_line_id,budget_line_id,company_id,site_id,disposition,created_by)
 SELECT id,NULL,company_id,site_id,'outside_budget',auth.uid()
 FROM public.bt_purchase_order_lines WHERE site_id=11 LIMIT 1$sql$,'42501');
RESET ROLE;

SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000006';
SET ROLE authenticated;
DO $check$
BEGIN
 IF (SELECT count(*) FROM public.bt_purchase_line_links)<>0
 THEN RAISE EXCEPTION 'Cross-company admin can inspect mapping'; END IF;
END $check$;
RESET ROLE;
SELECT 'PASS: purchase line correspondence privacy, unit protection, cross-site isolation and unchanged costs' AS result;
