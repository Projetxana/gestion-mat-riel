\set ON_ERROR_STOP on
-- Fabricated PostgreSQL 17 data only. Purchases fixture creates fake tenants A/B.
\ir purchases-rls-postgres.sql
\ir ../migrations/bt_purchases_mvp2_PROPOSED.sql

-- Real PostgreSQL policies: employees can submit a scan in their active company site;
-- they cannot read purchase prices or verified line quantities.
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
INSERT INTO public.bt_purchase_delivery_notes
    (id,company_id,site_id,uploaded_by,attachment_paths,fingerprint,email_sent_at)
VALUES
    ('aaaaaaaa-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
     11,'00000000-0000-0000-0000-000000000001',ARRAY['delivery_1.jpg'],repeat('a',64),now()),
    ('aaaaaaaa-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',
     11,'00000000-0000-0000-0000-000000000001',ARRAY['delivery_2.jpg'],repeat('b',64),now()),
    ('aaaaaaaa-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001',
     11,'00000000-0000-0000-0000-000000000001',ARRAY['delivery_3.jpg'],repeat('c',64),now());
SELECT public.bt_test_expect_error(
  $sql$INSERT INTO public.bt_purchase_delivery_notes
    (company_id,site_id,uploaded_by,attachment_paths,fingerprint,email_sent_at)
  VALUES ('20000000-0000-0000-0000-000000000001',22,
          '00000000-0000-0000-0000-000000000001',ARRAY['other.jpg'],repeat('d',64),now())$sql$,
  '42501');
SELECT public.bt_test_expect_error(
  $sql$INSERT INTO public.bt_purchase_delivery_notes
    (company_id,site_id,uploaded_by,attachment_paths,fingerprint,email_sent_at)
  VALUES ('10000000-0000-0000-0000-000000000001',11,
          '00000000-0000-0000-0000-000000000001',ARRAY['repeat.jpg'],repeat('a',64),now())$sql$,
  '23505');
SELECT public.bt_test_expect_error(
  $sql$SELECT public.bt_purchase_verify_delivery(
    '10000000-0000-0000-0000-000000000001',
    'aaaaaaaa-0000-0000-0000-000000000001',
    'aaaaaaaa-0000-0000-0000-000000000002','DOC1','[]'::jsonb)$sql$,
  '42501');
DO $check$
BEGIN
  IF (SELECT count(*) FROM public.bt_purchase_delivery_notes) <> 3
   OR (SELECT count(*) FROM public.bt_purchase_order_lines) <> 0
   OR (SELECT count(*) FROM public.bt_purchase_delivery_lines) <> 0 THEN
    RAISE EXCEPTION 'Employee can read financial quantities';
  END IF;
END $check$;
RESET ROLE;

-- Admin B cannot see/verify tenant A's scans.
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000006';
SET ROLE authenticated;
DO $check$
BEGIN
  IF (SELECT count(*) FROM public.bt_purchase_delivery_notes) <> 0 THEN
    RAISE EXCEPTION 'Cross-tenant scan exposure';
  END IF;
END $check$;
SELECT public.bt_test_expect_error(
  $sql$SELECT public.bt_purchase_verify_delivery(
    '10000000-0000-0000-0000-000000000001',
    'aaaaaaaa-0000-0000-0000-000000000001',
    'aaaaaaaa-0000-0000-0000-000000000002','DOC1','[]'::jsonb)$sql$,
  '42501');
RESET ROLE;

-- Admin A verifies first partial shipment using the correct PO and line.
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
SET ROLE authenticated;
DO $test$
DECLARE v_order uuid;
        v_other_order uuid;
        v_line bigint;
BEGIN
  SELECT id INTO v_order FROM public.bt_purchase_orders
    WHERE po_number='P02281' AND site_id=11 AND company_id='10000000-0000-0000-0000-000000000001';
  SELECT id INTO v_other_order FROM public.bt_purchase_orders
    WHERE po_number='P0999' AND site_id=12 AND company_id='10000000-0000-0000-0000-000000000001';
  SELECT id INTO v_line FROM public.bt_purchase_order_lines
    WHERE order_id=v_order LIMIT 1;

  BEGIN
    PERFORM public.bt_purchase_verify_delivery(
       '10000000-0000-0000-0000-000000000001',
       'aaaaaaaa-0000-0000-0000-000000000001',
       v_other_order,'WRONG',
       jsonb_build_array(jsonb_build_object('order_line_id',v_line,'shipped_qty',10,'supplier_bo_qty',10)));
    RAISE EXCEPTION 'Cross-site PO accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  PERFORM public.bt_purchase_verify_delivery(
       '10000000-0000-0000-0000-000000000001',
       'aaaaaaaa-0000-0000-0000-000000000001',
       v_order,'FL-001',
       jsonb_build_array(jsonb_build_object('order_line_id',v_line,'shipped_qty',10,'supplier_bo_qty',10)));
  IF (SELECT sum(shipped_qty) FROM public.bt_purchase_delivery_lines WHERE order_id=v_order) <> 10 THEN
    RAISE EXCEPTION 'First shipment quantity wrong';
  END IF;

  -- A second bon completes the order. BO=0 is an explicit supplier update.
  PERFORM public.bt_purchase_verify_delivery(
       '10000000-0000-0000-0000-000000000001',
       'aaaaaaaa-0000-0000-0000-000000000002',
       v_order,'FL-002',
       jsonb_build_array(jsonb_build_object('order_line_id',v_line,'shipped_qty',10,'supplier_bo_qty',0)));
  IF (SELECT sum(shipped_qty) FROM public.bt_purchase_delivery_lines WHERE order_id=v_order) <> 20 THEN
    RAISE EXCEPTION 'Second shipment aggregation wrong';
  END IF;
  BEGIN
    PERFORM public.bt_purchase_verify_delivery(
       '10000000-0000-0000-0000-000000000001',
       'aaaaaaaa-0000-0000-0000-000000000003',
       v_order,'FL-003',
       jsonb_build_array(jsonb_build_object('order_line_id',v_line,'shipped_qty',1,'supplier_bo_qty',null)));
    RAISE EXCEPTION 'Overdelivery accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF (SELECT status FROM public.bt_purchase_delivery_notes WHERE id='aaaaaaaa-0000-0000-0000-000000000003') <> 'pending_review'
    OR (SELECT count(*) FROM public.bt_purchase_delivery_lines WHERE order_id=v_order) <> 2 THEN
    RAISE EXCEPTION 'Overdelivery was not atomically rolled back';
  END IF;
  -- Prevent replay of an already-verified slip.
  BEGIN
    PERFORM public.bt_purchase_verify_delivery(
       '10000000-0000-0000-0000-000000000001',
       'aaaaaaaa-0000-0000-0000-000000000001',
       v_order,'FL-001',
       jsonb_build_array(jsonb_build_object('order_line_id',v_line,'shipped_qty',10,'supplier_bo_qty',10)));
    RAISE EXCEPTION 'Replayed delivery accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $test$;
RESET ROLE;

-- Anonymous sees neither notes nor their non-price quantities.
SET ROLE anon;
SELECT public.bt_test_expect_error(
  $sql$SELECT count(*) FROM public.bt_purchase_delivery_notes$sql$,'42501');
RESET ROLE;

SELECT 'PASS: receipt RLS, site/PO checks, employee scan, BO and partial shipment, duplicate image, overdelivery/replay atomicity' AS result;
