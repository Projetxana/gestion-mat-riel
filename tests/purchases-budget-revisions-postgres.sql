\set ON_ERROR_STOP on
\ir purchases-rls-postgres.sql
\ir ../migrations/bt_purchase_line_links_20261123_PROPOSED.sql
\ir ../migrations/bt_purchase_budget_revisions_20261123_PROPOSED.sql

DO $verify$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='bt_purchase_budget_revisions' AND c.relrowsecurity)
 THEN RAISE EXCEPTION 'revision table missing RLS'; END IF;
 IF has_table_privilege('anon','public.bt_purchase_budget_revisions','SELECT')
  OR has_table_privilege('authenticated','public.bt_purchase_budget_revisions','UPDATE')
  OR has_table_privilege('authenticated','public.bt_purchase_budget_lines','UPDATE')
  OR has_table_privilege('authenticated','public.bt_purchase_budget_lines','DELETE')
 THEN RAISE EXCEPTION 'revision/budget price ACL unsafe'; END IF;
END $verify$;

SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
SET ROLE authenticated;

-- Old links to initial estimate lines must survive future replacements.
INSERT INTO public.bt_purchase_line_links(order_line_id,budget_line_id,company_id,site_id,disposition,created_by)
SELECT o.id, b.id, o.company_id, o.site_id, 'linked', auth.uid()
FROM public.bt_purchase_order_lines o
JOIN public.bt_purchase_budget_lines b ON b.site_id=o.site_id
WHERE o.site_id=11 AND b.item_code='CD 00429';

SELECT public.bt_purchase_add_budget_revision(
 '10000000-0000-0000-0000-000000000001',11,'replacement','Estimation révisée','estimate-v2.pdf',
 repeat('a',64),
 '[{"item_code":"CD 00429","description":"Te CPVC revisé","unit":"UN","quantity":50,"unit_cost":4,"amount":200}]'::jsonb);
DO $verify$
BEGIN
 IF (SELECT coalesce(sum(amount),0) FROM public.bt_purchase_effective_budget_lines(
 '10000000-0000-0000-0000-000000000001',11))<>200
 OR (SELECT coalesce(sum(amount),0) FROM public.bt_purchase_budget_lines WHERE site_id=11 AND revision_id IS NULL)<>418
 OR (SELECT coalesce(sum(amount),0) FROM public.bt_purchase_order_lines WHERE site_id=11)<>76
 THEN RAISE EXCEPTION 'Replacement changed historical budget/PO or failed to supersede'; END IF;
END $verify$;

SELECT public.bt_purchase_add_budget_revision(
 '10000000-0000-0000-0000-000000000001',11,'extension','Agrandissement - Secteur B','extension-b.csv',
 repeat('b',64),
 '[{"item_code":"CD 07000","description":"Matériel ajouté","unit":"UN","quantity":2,"unit_cost":40,"amount":80}]'::jsonb);
DO $verify$
BEGIN
 IF (SELECT coalesce(sum(amount),0) FROM public.bt_purchase_effective_budget_lines(
 '10000000-0000-0000-0000-000000000001',11))<>280
 THEN RAISE EXCEPTION 'Extension was not added to current budget'; END IF;
END $verify$;

-- A third upload is a new replacement. Previous estimates still exist,
-- and all extensions remain active rather than being erased.
SELECT public.bt_purchase_add_budget_revision(
 '10000000-0000-0000-0000-000000000001',11,'replacement','Estimation V3','estimate-v3.pdf',
 repeat('c',64),
 '[{"item_code":"CD 00429","description":"Te CPVC revisé","unit":"UN","quantity":60,"unit_cost":5,"amount":300}]'::jsonb);

DO $verify$
BEGIN
 IF (SELECT count(*) FROM public.bt_purchase_budget_lines WHERE site_id=11)<>5
 OR (SELECT count(*) FROM public.bt_purchase_budget_revisions WHERE site_id=11)<>3
 OR (SELECT coalesce(sum(amount),0) FROM public.bt_purchase_effective_budget_lines(
 '10000000-0000-0000-0000-000000000001',11))<>380
 OR (SELECT count(*) FROM public.bt_purchase_effective_budget_lines(
 '10000000-0000-0000-0000-000000000001',11))<>2
 OR (SELECT count(*) FROM public.bt_purchase_line_links WHERE site_id=11)<>1
 OR (SELECT coalesce(sum(amount),0) FROM public.bt_purchase_order_lines WHERE site_id=11)<>76
 THEN RAISE EXCEPTION 'V3 budget summary, historical links or POs corrupted'; END IF;
END $verify$;

-- Existing site without revisions must still use immutable initial baseline.
DO $verify$
BEGIN
 IF (SELECT coalesce(sum(amount),0) FROM public.bt_purchase_effective_budget_lines(
 '10000000-0000-0000-0000-000000000001',12))<>8
 THEN RAISE EXCEPTION 'Baseline without revisions became invisible'; END IF;
END $verify$;

SELECT public.bt_test_expect_error(
 $sql$SELECT public.bt_purchase_add_budget_revision(
 '10000000-0000-0000-0000-000000000001',11,'extension','Duplicate','dupe.pdf',
 repeat('c',64),
 '[{"description":"Dup","unit":"UN","quantity":1,"unit_cost":1,"amount":1}]'::jsonb)$sql$,'23505');
SELECT public.bt_test_expect_error(
 $sql$SELECT public.bt_purchase_add_budget_revision(
 '10000000-0000-0000-0000-000000000001',11,'replacement','Bad','bad.pdf',
 repeat('d',64),
 '[{"description":"Bad","unit":"UN","quantity":-1,"unit_cost":1,"amount":1}]'::jsonb)$sql$,'P0001');
SELECT public.bt_test_expect_error(
 $sql$SELECT public.bt_purchase_add_budget_revision(
 '10000000-0000-0000-0000-000000000001',33,'extension','Archived','archived.pdf',
 repeat('d',64),
 '[{"description":"Bad","unit":"UN","quantity":1,"unit_cost":1,"amount":1}]'::jsonb)$sql$,'42501');
RESET ROLE;

SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
DO $verify$
BEGIN
 IF (SELECT count(*) FROM public.bt_purchase_budget_revisions)<>0
 OR (SELECT count(*) FROM public.bt_purchase_effective_budget_lines(
 '10000000-0000-0000-0000-000000000001',11))<>0
 THEN RAISE EXCEPTION 'Employee can see private revised estimate'; END IF;
END $verify$;
SELECT public.bt_test_expect_error(
 $sql$SELECT public.bt_purchase_add_budget_revision(
 '10000000-0000-0000-0000-000000000001',11,'extension','Unauthorized','hack.pdf',
 repeat('e',64),
 '[{"description":"One","unit":"UN","quantity":1,"unit_cost":1,"amount":1}]'::jsonb)$sql$,'42501');
RESET ROLE;

SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000006';
SET ROLE authenticated;
DO $verify$
BEGIN
 IF (SELECT count(*) FROM public.bt_purchase_budget_revisions)<>0
 OR (SELECT count(*) FROM public.bt_purchase_effective_budget_lines(
 '10000000-0000-0000-0000-000000000001',11))<>0
 THEN RAISE EXCEPTION 'Other company can read revised costs'; END IF;
END $verify$;
RESET ROLE;

SET ROLE anon;
SELECT public.bt_test_expect_error(
 $sql$SELECT public.bt_purchase_effective_budget_lines(
 '10000000-0000-0000-0000-000000000001',11)$sql$,'42501');
RESET ROLE;
SELECT 'PASS: immutable budget versions, extension survival, PO/link history, RLS separation' AS result;
