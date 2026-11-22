-- BuildTrack purchases MVP 2 (PROPOSED; do not apply directly to production).
-- Delivery slips are logistics only; they never add or modify purchase commitments.
-- Depends on migrations/bt_purchases_mvp1_PROPOSED.sql.
BEGIN;

-- FK coherence: a delivery must belong to the same company, site and order line.
ALTER TABLE public.bt_purchase_order_lines
  ADD CONSTRAINT bt_po_line_id_parent_unique UNIQUE (id, order_id, company_id, site_id);

CREATE TABLE public.bt_purchase_delivery_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  site_id bigint NOT NULL REFERENCES public.sites(id) ON DELETE RESTRICT,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id),
  order_id uuid,
  po_number text NOT NULL DEFAULT '',
  supplier text NOT NULL DEFAULT '',
  supplier_note_number text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review','verified')),
  source_bucket text NOT NULL DEFAULT 'delivery-notes'
    CHECK (source_bucket = 'delivery-notes'),
  attachment_paths text[] NOT NULL CHECK (cardinality(attachment_paths) BETWEEN 1 AND 10),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  email_sent_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  CONSTRAINT bt_delivery_note_order_fk
    FOREIGN KEY (order_id,company_id,site_id)
    REFERENCES public.bt_purchase_orders(id,company_id,site_id),
  CONSTRAINT bt_delivery_note_full_key UNIQUE (id,order_id,company_id,site_id),
  CONSTRAINT bt_delivery_note_verified_consistency
    CHECK ((status='pending_review' AND verified_at IS NULL AND order_id IS NULL)
        OR (status='verified' AND verified_at IS NOT NULL AND order_id IS NOT NULL))
);
CREATE UNIQUE INDEX bt_delivery_note_fingerprint_idx
  ON public.bt_purchase_delivery_notes(company_id,fingerprint);
CREATE INDEX bt_delivery_note_site_status_idx
  ON public.bt_purchase_delivery_notes(company_id,site_id,status,created_at DESC);

CREATE TABLE public.bt_purchase_delivery_lines (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  delivery_id uuid NOT NULL,
  order_id uuid NOT NULL,
  company_id uuid NOT NULL,
  site_id bigint NOT NULL,
  order_line_id bigint NOT NULL,
  shipped_qty numeric(16,3) NOT NULL CHECK (shipped_qty >= 0),
  supplier_bo_qty numeric(16,3) CHECK (supplier_bo_qty >= 0),
  CONSTRAINT bt_delivery_line_unique UNIQUE (delivery_id,order_line_id),
  CONSTRAINT bt_delivery_line_note_fk
    FOREIGN KEY (delivery_id,order_id,company_id,site_id)
    REFERENCES public.bt_purchase_delivery_notes(id,order_id,company_id,site_id),
  CONSTRAINT bt_delivery_line_order_fk
    FOREIGN KEY (order_line_id,order_id,company_id,site_id)
    REFERENCES public.bt_purchase_order_lines(id,order_id,company_id,site_id),
  CONSTRAINT bt_delivery_line_nonempty
    CHECK (shipped_qty > 0 OR supplier_bo_qty > 0)
);
CREATE INDEX bt_delivery_lines_order_idx
  ON public.bt_purchase_delivery_lines(order_id,order_line_id);

ALTER TABLE public.bt_purchase_delivery_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bt_purchase_delivery_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY bt_delivery_notes_read ON public.bt_purchase_delivery_notes
  FOR SELECT TO authenticated USING (
    public.bt_stage2_is_admin(company_id) OR uploaded_by=(SELECT auth.uid())
  );
CREATE POLICY bt_delivery_notes_insert ON public.bt_purchase_delivery_notes
  FOR INSERT TO authenticated WITH CHECK (
    uploaded_by=(SELECT auth.uid())
    AND status='pending_review' AND order_id IS NULL
    AND supplier='' AND po_number='' AND supplier_note_number=''
    AND verified_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.company_users cu ON cu.company_id=s.company_id
      WHERE s.id=bt_purchase_delivery_notes.site_id
        AND s.company_id=bt_purchase_delivery_notes.company_id
        AND s.status='active' AND cu.user_id=(SELECT auth.uid())
    )
  );
CREATE POLICY bt_delivery_notes_update ON public.bt_purchase_delivery_notes
  FOR UPDATE TO authenticated
  USING (public.bt_stage2_is_admin(company_id))
  WITH CHECK (public.bt_stage2_is_admin(company_id));
CREATE POLICY bt_delivery_lines_read ON public.bt_purchase_delivery_lines
  FOR SELECT TO authenticated USING (public.bt_stage2_is_admin(company_id));
CREATE POLICY bt_delivery_lines_insert ON public.bt_purchase_delivery_lines
  FOR INSERT TO authenticated WITH CHECK (public.bt_stage2_is_admin(company_id));

REVOKE ALL ON public.bt_purchase_delivery_notes,public.bt_purchase_delivery_lines
  FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT ON public.bt_purchase_delivery_notes TO authenticated;
GRANT UPDATE (order_id, po_number, supplier, supplier_note_number, status, verified_at)
  ON public.bt_purchase_delivery_notes TO authenticated;
GRANT SELECT,INSERT ON public.bt_purchase_delivery_lines TO authenticated;
GRANT USAGE,SELECT ON SEQUENCE public.bt_purchase_delivery_lines_id_seq TO authenticated;

-- Verification is a single immutable transaction. An order row lock serializes
-- concurrent delivery confirmations to prevent cumulative overdelivery races.
CREATE OR REPLACE FUNCTION public.bt_purchase_verify_delivery(
  p_company_id uuid,
  p_delivery_id uuid,
  p_order_id uuid,
  p_supplier_note_number text,
  p_lines jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $fn$
DECLARE
  v_note public.bt_purchase_delivery_notes%ROWTYPE;
  v_order public.bt_purchase_orders%ROWTYPE;
  v_expected integer;
  v_inserted integer;
BEGIN
  IF NOT public.bt_stage2_is_admin(p_company_id) THEN
    RAISE EXCEPTION 'Administrateur requis' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_note FROM public.bt_purchase_delivery_notes
  WHERE id=p_delivery_id AND company_id=p_company_id FOR UPDATE;
  IF NOT FOUND OR v_note.status <> 'pending_review' THEN
    RAISE EXCEPTION 'Bon absent ou déjà vérifié' USING ERRCODE='23514';
  END IF;

  SELECT * INTO v_order FROM public.bt_purchase_orders
  WHERE id=p_order_id AND company_id=p_company_id
    AND site_id=v_note.site_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Le PO ne correspond pas au chantier du bon' USING ERRCODE='23514';
  END IF;
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Lignes de livraison invalides' USING ERRCODE='23514';
  END IF;
  v_expected:=jsonb_array_length(p_lines);

  -- A reviewed slip has no monetary columns. No changes to budget/order tables.
  UPDATE public.bt_purchase_delivery_notes
  SET status='verified', order_id=p_order_id, po_number=v_order.po_number,
      supplier=v_order.supplier,
      supplier_note_number=left(coalesce(p_supplier_note_number,''),100),
      verified_at=now()
  WHERE id=p_delivery_id AND company_id=p_company_id;

  INSERT INTO public.bt_purchase_delivery_lines
    (delivery_id,order_id,company_id,site_id,order_line_id,shipped_qty,supplier_bo_qty)
  SELECT p_delivery_id,p_order_id,p_company_id,v_note.site_id,
         l.order_line_id,l.shipped_qty,l.supplier_bo_qty
  FROM jsonb_to_recordset(p_lines) AS l(
     order_line_id bigint,shipped_qty numeric,supplier_bo_qty numeric);

  GET DIAGNOSTICS v_inserted=ROW_COUNT;
  IF v_inserted <> v_expected THEN
    RAISE EXCEPTION 'Lignes de livraison incomplètes' USING ERRCODE='23514';
  END IF;

  -- Never silently accept shipments above the quantity confirmed on the PO.
  IF EXISTS (
    SELECT 1 FROM public.bt_purchase_order_lines ol
    JOIN public.bt_purchase_delivery_lines dl
      ON dl.order_line_id=ol.id AND dl.order_id=p_order_id
    JOIN public.bt_purchase_delivery_notes dn
      ON dn.id=dl.delivery_id AND dn.status='verified'
    WHERE ol.order_id=p_order_id
    GROUP BY ol.id,ol.quantity
    HAVING SUM(dl.shipped_qty)>ol.quantity
  ) THEN
    RAISE EXCEPTION 'Livraison cumulée supérieure au PO' USING ERRCODE='23514';
  END IF;

  RETURN p_delivery_id;
END
$fn$;

REVOKE ALL ON FUNCTION public.bt_purchase_verify_delivery(uuid,uuid,uuid,text,jsonb)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bt_purchase_verify_delivery(uuid,uuid,uuid,text,jsonb)
  TO authenticated;
COMMIT;
