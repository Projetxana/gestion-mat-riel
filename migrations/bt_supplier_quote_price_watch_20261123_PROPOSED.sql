-- BuildTrack — approved supplier quotations are immutable unit-price references.
-- PROPOSED / NOT APPLIED. Apply after staging RLS tests and backup verification.
-- Does NOT modify initial estimate, budget revisions, orders, deliveries, or IPMO.
BEGIN;

CREATE TABLE public.bt_supplier_price_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  site_id bigint NOT NULL REFERENCES public.sites(id) ON DELETE RESTRICT,
  supplier text NOT NULL CHECK(length(btrim(supplier)) BETWEEN 1 AND 150),
  quote_number text NOT NULL CHECK(length(btrim(quote_number)) BETWEEN 1 AND 100),
  quote_date date,
  source_name text NOT NULL CHECK(length(btrim(source_name)) BETWEEN 1 AND 250),
  file_sha256 text NOT NULL CHECK(file_sha256 ~ '^[a-f0-9]{64}$'),
  line_count integer NOT NULL CHECK(line_count BETWEEN 1 AND 5000),
  total_amount numeric(18,2) NOT NULL CHECK(total_amount >= 0),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bt_supplier_price_quote_composite UNIQUE(id,company_id,site_id)
);
CREATE UNIQUE INDEX bt_supplier_price_quote_document
  ON public.bt_supplier_price_quotes(company_id,site_id,lower(btrim(supplier)),file_sha256);
CREATE INDEX bt_supplier_price_quote_latest
  ON public.bt_supplier_price_quotes(company_id,site_id,lower(btrim(supplier)),created_at DESC,id DESC);

CREATE TABLE public.bt_supplier_price_lines (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  quote_id uuid NOT NULL,
  company_id uuid NOT NULL,
  site_id bigint NOT NULL,
  item_code text NOT NULL CHECK(length(btrim(item_code)) BETWEEN 1 AND 100),
  customer_alias text NOT NULL DEFAULT '',
  description text NOT NULL CHECK(length(btrim(description)) BETWEEN 1 AND 500),
  unit text NOT NULL CHECK(length(btrim(unit)) BETWEEN 1 AND 30),
  quantity numeric(16,3) NOT NULL CHECK(quantity>0),
  unit_cost numeric(16,4) NOT NULL CHECK(unit_cost>=0),
  amount numeric(16,2) NOT NULL CHECK(amount>=0),
  source_sequence integer,
  CONSTRAINT bt_supplier_price_lines_parent
    FOREIGN KEY(quote_id,company_id,site_id)
    REFERENCES public.bt_supplier_price_quotes(id,company_id,site_id) ON DELETE RESTRICT
);
CREATE INDEX bt_supplier_price_lines_quote ON public.bt_supplier_price_lines(quote_id);

-- A saved manual correspondence is needed when vendor SKUs differ;
-- never silently match only a fuzzy description.
CREATE TABLE public.bt_supplier_price_line_links (
  order_line_id bigint PRIMARY KEY REFERENCES public.bt_purchase_order_lines(id) ON DELETE RESTRICT,
  quote_line_id bigint NOT NULL REFERENCES public.bt_supplier_price_lines(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  site_id bigint NOT NULL REFERENCES public.sites(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bt_supplier_price_line_links_site
 ON public.bt_supplier_price_line_links(company_id,site_id);

ALTER TABLE public.bt_supplier_price_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bt_supplier_price_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bt_supplier_price_line_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY bt_supplier_price_quotes_select ON public.bt_supplier_price_quotes
 FOR SELECT TO authenticated USING(public.bt_stage2_is_admin(company_id));
CREATE POLICY bt_supplier_price_quotes_insert ON public.bt_supplier_price_quotes
 FOR INSERT TO authenticated WITH CHECK(
  public.bt_stage2_is_admin(company_id) AND created_by=(SELECT auth.uid())
  AND EXISTS(SELECT 1 FROM public.sites s
   WHERE s.id=bt_supplier_price_quotes.site_id
    AND s.company_id=bt_supplier_price_quotes.company_id
    AND s.status='active')
 );
CREATE POLICY bt_supplier_price_lines_select ON public.bt_supplier_price_lines
 FOR SELECT TO authenticated USING(public.bt_stage2_is_admin(company_id));
CREATE POLICY bt_supplier_price_lines_insert ON public.bt_supplier_price_lines
 FOR INSERT TO authenticated WITH CHECK(
  public.bt_stage2_is_admin(company_id)
  AND EXISTS(SELECT 1 FROM public.bt_supplier_price_quotes q
   WHERE q.id=bt_supplier_price_lines.quote_id
   AND q.company_id=bt_supplier_price_lines.company_id
   AND q.site_id=bt_supplier_price_lines.site_id)
 );
CREATE POLICY bt_supplier_price_links_select ON public.bt_supplier_price_line_links
 FOR SELECT TO authenticated USING(public.bt_stage2_is_admin(company_id));
CREATE POLICY bt_supplier_price_links_insert ON public.bt_supplier_price_line_links
 FOR INSERT TO authenticated WITH CHECK(
  public.bt_stage2_is_admin(company_id) AND created_by=(SELECT auth.uid())
  AND EXISTS(SELECT 1
   FROM public.bt_purchase_order_lines o
   JOIN public.bt_purchase_orders po ON po.id=o.order_id
   JOIN public.bt_supplier_price_lines q
    ON q.id=bt_supplier_price_line_links.quote_line_id
   JOIN public.bt_supplier_price_quotes sq ON sq.id=q.quote_id
   WHERE o.id=bt_supplier_price_line_links.order_line_id
   AND lower(btrim(po.supplier))=lower(btrim(sq.supplier))
   AND o.company_id=bt_supplier_price_line_links.company_id
   AND o.site_id=bt_supplier_price_line_links.site_id
   AND q.company_id=o.company_id AND q.site_id=o.site_id
   AND public.bt_purchase_unit_key(q.unit)=public.bt_purchase_unit_key(o.unit))
 );
CREATE POLICY bt_supplier_price_links_update ON public.bt_supplier_price_line_links
 FOR UPDATE TO authenticated
 USING(public.bt_stage2_is_admin(company_id))
 WITH CHECK(
  public.bt_stage2_is_admin(company_id) AND created_by=(SELECT auth.uid())
  AND EXISTS(SELECT 1
   FROM public.bt_purchase_order_lines o
   JOIN public.bt_purchase_orders po ON po.id=o.order_id
   JOIN public.bt_supplier_price_lines q
    ON q.id=bt_supplier_price_line_links.quote_line_id
   JOIN public.bt_supplier_price_quotes sq ON sq.id=q.quote_id
   WHERE o.id=bt_supplier_price_line_links.order_line_id
   AND lower(btrim(po.supplier))=lower(btrim(sq.supplier))
   AND o.company_id=bt_supplier_price_line_links.company_id
   AND o.site_id=bt_supplier_price_line_links.site_id
   AND q.company_id=o.company_id AND q.site_id=o.site_id
   AND public.bt_purchase_unit_key(q.unit)=public.bt_purchase_unit_key(o.unit))
 );
CREATE POLICY bt_supplier_price_links_delete ON public.bt_supplier_price_line_links
 FOR DELETE TO authenticated USING(public.bt_stage2_is_admin(company_id));

REVOKE ALL ON public.bt_supplier_price_quotes,public.bt_supplier_price_lines,
 public.bt_supplier_price_line_links FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.bt_supplier_price_quotes,public.bt_supplier_price_lines TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.bt_supplier_price_line_links TO authenticated;
GRANT USAGE,SELECT ON SEQUENCE public.bt_supplier_price_lines_id_seq TO authenticated;

CREATE FUNCTION public.bt_supplier_price_register(
 p_company_id uuid,p_site_id bigint,p_supplier text,p_quote_number text,
 p_quote_date date,p_source_name text,p_file_sha256 text,
 p_expected_total numeric,p_lines jsonb,p_confirmed boolean
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $fn$
DECLARE
 v_id uuid;
 v_total numeric(18,2);
 v_count integer;
BEGIN
 IF NOT public.bt_stage2_is_admin(p_company_id) THEN
  RAISE EXCEPTION 'Administrateur requis' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.sites s
  WHERE s.id=p_site_id AND s.company_id=p_company_id AND s.status='active') THEN
  RAISE EXCEPTION 'Chantier invalide ou inactif' USING ERRCODE='42501';
 END IF;
 IF p_confirmed IS DISTINCT FROM true OR
  length(btrim(coalesce(p_supplier,''))) NOT BETWEEN 1 AND 150 OR
  length(btrim(coalesce(p_quote_number,''))) NOT BETWEEN 1 AND 100 OR
  length(btrim(coalesce(p_source_name,''))) NOT BETWEEN 1 AND 250 OR
  coalesce(p_file_sha256,'') !~ '^[a-f0-9]{64}$' THEN
  RAISE EXCEPTION 'Validation de la soumission ou champs requis manquants';
 END IF;
 IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR
  jsonb_array_length(p_lines) NOT BETWEEN 1 AND 5000 THEN
  RAISE EXCEPTION 'Liste de prix invalide';
 END IF;
 IF EXISTS (
  SELECT 1 FROM jsonb_to_recordset(p_lines)
   AS l(item_code text,description text,unit text,
    quantity numeric,unit_cost numeric,amount numeric)
  WHERE length(btrim(coalesce(l.item_code,''))) NOT BETWEEN 1 AND 100 OR
   length(btrim(coalesce(l.description,''))) NOT BETWEEN 1 AND 500 OR
   length(btrim(coalesce(l.unit,''))) NOT BETWEEN 1 AND 30 OR
   l.quantity IS NULL OR l.quantity<=0 OR l.quantity>99999999999 OR
   l.unit_cost IS NULL OR l.unit_cost<0 OR l.amount IS NULL OR l.amount<0 OR
   abs(round(l.quantity*l.unit_cost,2)-l.amount) > 0.02
 ) THEN
  RAISE EXCEPTION 'Ligne de prix fournisseur invalide ou total incohérent';
 END IF;
 SELECT count(*),round(sum(l.amount),2)
 INTO v_count,v_total FROM jsonb_to_recordset(p_lines) AS l(amount numeric);
 IF p_expected_total IS NULL OR p_expected_total<0 OR abs(v_total-p_expected_total)>0.02 THEN
  RAISE EXCEPTION 'Sous-total des articles différent du total de soumission';
 END IF;
 PERFORM pg_advisory_xact_lock(
  hashtextextended(p_company_id::text||':'||p_site_id::text||':'||lower(btrim(p_supplier)),80124));
 INSERT INTO public.bt_supplier_price_quotes(
   company_id,site_id,supplier,quote_number,quote_date,source_name,
   file_sha256,line_count,total_amount,created_by)
 VALUES(p_company_id,p_site_id,btrim(p_supplier),btrim(p_quote_number),
  p_quote_date,btrim(p_source_name),p_file_sha256,v_count,v_total,auth.uid())
 RETURNING id INTO v_id;
 INSERT INTO public.bt_supplier_price_lines(
  quote_id,company_id,site_id,item_code,customer_alias,description,
  unit,quantity,unit_cost,amount,source_sequence)
 SELECT v_id,p_company_id,p_site_id,
  btrim(l.item_code),coalesce(l.customer_alias,''),l.description,
  upper(btrim(l.unit)),l.quantity,l.unit_cost,l.amount,l.source_sequence
 FROM jsonb_to_recordset(p_lines) AS l(
  item_code text,customer_alias text,description text,unit text,
  quantity numeric,unit_cost numeric,amount numeric,source_sequence integer);
 RETURN v_id;
END
$fn$;

REVOKE ALL ON FUNCTION public.bt_supplier_price_register(
 uuid,bigint,text,text,date,text,text,numeric,jsonb,boolean)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bt_supplier_price_register(
 uuid,bigint,text,text,date,text,text,numeric,jsonb,boolean)
 TO authenticated;
COMMIT;
