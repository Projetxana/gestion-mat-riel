-- BuildTrack purchases MVP 1 — NOT APPLIED TO PRODUCTION.
-- Run after review in a staging Supabase branch, then explicitly in production.
-- Every row is tenant-bound; monetary information is admin-only.
-- Tax amounts and delivery receipts are not part of purchase commitments.
BEGIN;

CREATE TABLE IF NOT EXISTS public.bt_purchase_budgets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES public.companies(id),
    site_id bigint NOT NULL REFERENCES public.sites(id) ON DELETE RESTRICT,
    source_name text NOT NULL CHECK (length(btrim(source_name)) BETWEEN 1 AND 250),
    created_by uuid NOT NULL REFERENCES auth.users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT bt_purchase_budget_one_site UNIQUE (site_id),
    CONSTRAINT bt_purchase_budget_parent_key UNIQUE (id, company_id, site_id)
);

CREATE TABLE IF NOT EXISTS public.bt_purchase_budget_lines (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    budget_id uuid NOT NULL,
    company_id uuid NOT NULL,
    site_id bigint NOT NULL,
    item_code text NOT NULL DEFAULT '',
    description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 500),
    unit text NOT NULL CHECK (length(btrim(unit)) BETWEEN 1 AND 30),
    quantity numeric(16,3) NOT NULL CHECK (quantity > 0),
    unit_cost numeric(16,4) NOT NULL CHECK (unit_cost >= 0),
    amount numeric(16,2) NOT NULL CHECK (amount >= 0),
    CONSTRAINT bt_purchase_budget_lines_parent
        FOREIGN KEY (budget_id, company_id, site_id)
        REFERENCES public.bt_purchase_budgets(id, company_id, site_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.bt_purchase_orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES public.companies(id),
    site_id bigint NOT NULL REFERENCES public.sites(id) ON DELETE RESTRICT,
    po_number text NOT NULL CHECK (length(btrim(po_number)) BETWEEN 1 AND 100),
    supplier text NOT NULL CHECK (length(btrim(supplier)) BETWEEN 1 AND 150),
    supplier_order_number text NOT NULL DEFAULT '',
    shipping_project_name text NOT NULL CHECK (length(btrim(shipping_project_name)) BETWEEN 1 AND 250),
    order_date date,
    source_name text NOT NULL DEFAULT '',
    project_verified_by uuid NOT NULL REFERENCES auth.users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT bt_purchase_order_parent_key UNIQUE (id, company_id, site_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS bt_purchase_unique_supplier_po
    ON public.bt_purchase_orders (company_id, lower(btrim(supplier)), upper(regexp_replace(po_number, '[[:space:]]+', '', 'g')));
CREATE INDEX IF NOT EXISTS bt_purchase_order_site_idx
    ON public.bt_purchase_orders (company_id, site_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.bt_purchase_order_lines (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id uuid NOT NULL,
    company_id uuid NOT NULL,
    site_id bigint NOT NULL,
    item_code text NOT NULL DEFAULT '',
    description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 500),
    unit text NOT NULL CHECK (length(btrim(unit)) BETWEEN 1 AND 30),
    quantity numeric(16,3) NOT NULL CHECK (quantity > 0),
    unit_cost numeric(16,4) NOT NULL CHECK (unit_cost >= 0),
    amount numeric(16,2) NOT NULL CHECK (amount >= 0),
    CONSTRAINT bt_purchase_order_lines_parent
        FOREIGN KEY (order_id, company_id, site_id)
        REFERENCES public.bt_purchase_orders(id, company_id, site_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS bt_purchase_order_lines_order_idx ON public.bt_purchase_order_lines(order_id);

ALTER TABLE public.bt_purchase_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bt_purchase_budget_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bt_purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bt_purchase_order_lines ENABLE ROW LEVEL SECURITY;

-- Pricing remains restricted to validated company administrators, never employees.
CREATE POLICY bt_purchase_budgets_read ON public.bt_purchase_budgets
    FOR SELECT TO authenticated USING (public.bt_stage2_is_admin(company_id));
CREATE POLICY bt_purchase_budgets_insert ON public.bt_purchase_budgets
    FOR INSERT TO authenticated WITH CHECK (
        public.bt_stage2_is_admin(company_id)
        AND created_by = (SELECT auth.uid())
        AND EXISTS (SELECT 1 FROM public.sites s
            WHERE s.id = site_id AND s.company_id = company_id AND s.status = 'active')
    );
CREATE POLICY bt_purchase_budget_lines_read ON public.bt_purchase_budget_lines
    FOR SELECT TO authenticated USING (public.bt_stage2_is_admin(company_id));
CREATE POLICY bt_purchase_budget_lines_insert ON public.bt_purchase_budget_lines
    FOR INSERT TO authenticated WITH CHECK (public.bt_stage2_is_admin(company_id));

CREATE POLICY bt_purchase_orders_read ON public.bt_purchase_orders
    FOR SELECT TO authenticated USING (public.bt_stage2_is_admin(company_id));
CREATE POLICY bt_purchase_orders_insert ON public.bt_purchase_orders
    FOR INSERT TO authenticated WITH CHECK (
        public.bt_stage2_is_admin(company_id)
        AND project_verified_by = (SELECT auth.uid())
        AND EXISTS (SELECT 1 FROM public.sites s
            WHERE s.id = site_id AND s.company_id = company_id AND s.status = 'active')
    );
CREATE POLICY bt_purchase_order_lines_read ON public.bt_purchase_order_lines
    FOR SELECT TO authenticated USING (public.bt_stage2_is_admin(company_id));
CREATE POLICY bt_purchase_order_lines_insert ON public.bt_purchase_order_lines
    FOR INSERT TO authenticated WITH CHECK (public.bt_stage2_is_admin(company_id));

-- Only SELECT and INSERT are permitted. No client UPDATE/DELETE to historical costs.
REVOKE ALL ON public.bt_purchase_budgets, public.bt_purchase_budget_lines,
    public.bt_purchase_orders, public.bt_purchase_order_lines FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.bt_purchase_budgets, public.bt_purchase_budget_lines,
    public.bt_purchase_orders, public.bt_purchase_order_lines TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.bt_purchase_budget_lines_id_seq,
    public.bt_purchase_order_lines_id_seq TO authenticated;

-- An import executes atomically. A second initial budget for the same site is rejected.
CREATE OR REPLACE FUNCTION public.bt_purchase_import_budget(
    p_company_id uuid, p_site_id bigint, p_source_name text, p_lines jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE v_id uuid;
BEGIN
    IF NOT public.bt_stage2_is_admin(p_company_id)
      OR NOT EXISTS (SELECT 1 FROM public.sites s
          WHERE s.id=p_site_id AND s.company_id=p_company_id AND s.status='active') THEN
        RAISE EXCEPTION 'Chantier indisponible ou administrateur requis' USING ERRCODE='42501';
    END IF;
    IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array'
       OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 5000 THEN
        RAISE EXCEPTION 'Liste des articles invalide (1 à 5000 lignes)';
    END IF;
    INSERT INTO public.bt_purchase_budgets(company_id, site_id, source_name, created_by)
    VALUES (p_company_id, p_site_id, p_source_name, auth.uid())
    RETURNING id INTO v_id;
    INSERT INTO public.bt_purchase_budget_lines
        (budget_id, company_id, site_id, item_code, description, unit, quantity, unit_cost, amount)
    SELECT v_id, p_company_id, p_site_id,
        coalesce(l.item_code, ''), l.description, l.unit, l.quantity, l.unit_cost, l.amount
    FROM jsonb_to_recordset(p_lines)
        AS l(item_code text, description text, unit text,
             quantity numeric, unit_cost numeric, amount numeric);
    RETURN v_id;
END;
$fn$;

-- The operator must explicitly verify the shipping project before importing an order.
-- The PO is unique per supplier and company, not a chantier identifier.
CREATE OR REPLACE FUNCTION public.bt_purchase_create_order(
    p_company_id uuid, p_site_id bigint, p_po_number text, p_supplier text,
    p_supplier_order_number text, p_shipping_project_name text, p_order_date date,
    p_source_name text, p_project_verified boolean, p_override_confirmation text, p_lines jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE v_id uuid;
        v_site_name text;
BEGIN
    SELECT s.name INTO v_site_name FROM public.sites s
    WHERE s.id=p_site_id AND s.company_id=p_company_id AND s.status='active';
    IF NOT public.bt_stage2_is_admin(p_company_id) OR v_site_name IS NULL THEN
        RAISE EXCEPTION 'Chantier indisponible ou administrateur requis' USING ERRCODE='42501';
    END IF;
    IF lower(regexp_replace(btrim(coalesce(p_shipping_project_name,'')), '[[:space:][:punct:]]+', '', 'g'))
       <> lower(regexp_replace(btrim(v_site_name), '[[:space:][:punct:]]+', '', 'g'))
       AND lower(btrim(coalesce(p_override_confirmation,''))) <> lower(btrim(v_site_name)) THEN
        RAISE EXCEPTION 'Nom du chantier de livraison différent : validation explicite requise';
    END IF;
    IF p_project_verified IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Le chantier de livraison doit être vérifié';
    END IF;
    IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array'
      OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 5000 THEN
        RAISE EXCEPTION 'Lignes de commande invalides';
    END IF;
    INSERT INTO public.bt_purchase_orders
        (company_id, site_id, po_number, supplier, supplier_order_number,
         shipping_project_name, order_date, source_name, project_verified_by)
    VALUES (p_company_id, p_site_id, btrim(p_po_number), btrim(p_supplier),
            coalesce(p_supplier_order_number, ''), btrim(p_shipping_project_name),
            p_order_date, coalesce(p_source_name, ''), auth.uid())
    RETURNING id INTO v_id;
    INSERT INTO public.bt_purchase_order_lines
        (order_id, company_id, site_id, item_code, description, unit, quantity, unit_cost, amount)
    SELECT v_id, p_company_id, p_site_id, coalesce(l.item_code, ''),
           l.description, l.unit, l.quantity, l.unit_cost, l.amount
    FROM jsonb_to_recordset(p_lines)
        AS l(item_code text, description text, unit text,
             quantity numeric, unit_cost numeric, amount numeric);
    RETURN v_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.bt_purchase_import_budget(uuid,bigint,text,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bt_purchase_create_order(uuid,bigint,text,text,text,text,date,text,boolean,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bt_purchase_import_budget(uuid,bigint,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bt_purchase_create_order(uuid,bigint,text,text,text,text,date,text,boolean,jsonb) TO authenticated;

COMMIT;
