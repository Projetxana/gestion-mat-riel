-- BuildTrack - non-destructive replacement and material-scope extensions.
-- Baseline and all POs remain immutable. All revisions are append-only.
BEGIN;

CREATE TABLE public.bt_purchase_budget_revisions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    budget_id uuid NOT NULL,
    company_id uuid NOT NULL,
    site_id bigint NOT NULL,
    revision_no integer NOT NULL CHECK(revision_no > 0),
    kind text NOT NULL CHECK(kind IN ('replacement','extension')),
    label text NOT NULL CHECK(length(btrim(label)) BETWEEN 1 AND 150),
    source_name text NOT NULL CHECK(length(btrim(source_name)) BETWEEN 1 AND 250),
    file_sha256 text CHECK(file_sha256 IS NULL OR file_sha256 ~ '^[a-f0-9]{64}$'),
    line_count integer NOT NULL CHECK(line_count BETWEEN 1 AND 5000),
    total_amount numeric(18,2) NOT NULL CHECK(total_amount >= 0),
    created_by uuid NOT NULL REFERENCES auth.users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT bt_purchase_revision_budget
        FOREIGN KEY(budget_id, company_id, site_id)
        REFERENCES public.bt_purchase_budgets(id, company_id, site_id) ON DELETE RESTRICT,
    CONSTRAINT bt_purchase_revision_same_no UNIQUE (budget_id, revision_no),
    CONSTRAINT bt_purchase_revision_parent_key UNIQUE (id, budget_id, company_id, site_id)
);
CREATE UNIQUE INDEX bt_purchase_revision_unique_file
    ON public.bt_purchase_budget_revisions(company_id, site_id, file_sha256)
    WHERE file_sha256 IS NOT NULL;
CREATE INDEX bt_purchase_revision_site
    ON public.bt_purchase_budget_revisions(company_id, site_id, revision_no DESC);

-- The ID of an old line never disappears: existing supplier-to-budget mappings
-- remain auditable and will show as unresolved if their original version is superseded.
ALTER TABLE public.bt_purchase_budget_lines
    ADD COLUMN revision_id uuid;
ALTER TABLE public.bt_purchase_budget_lines
    ADD CONSTRAINT bt_purchase_line_revision_parent
    FOREIGN KEY(revision_id, budget_id, company_id, site_id)
    REFERENCES public.bt_purchase_budget_revisions(id, budget_id, company_id, site_id)
    ON DELETE RESTRICT;
CREATE INDEX bt_purchase_budget_line_revision_idx
    ON public.bt_purchase_budget_lines(revision_id) WHERE revision_id IS NOT NULL;

ALTER TABLE public.bt_purchase_budget_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY bt_purchase_revisions_admin_select
    ON public.bt_purchase_budget_revisions FOR SELECT TO authenticated
    USING(public.bt_stage2_is_admin(company_id));
CREATE POLICY bt_purchase_revisions_admin_insert
    ON public.bt_purchase_budget_revisions FOR INSERT TO authenticated WITH CHECK(
        public.bt_stage2_is_admin(company_id) AND created_by=(SELECT auth.uid())
        AND EXISTS(SELECT 1 FROM public.sites s
            WHERE s.id=site_id AND s.company_id=bt_purchase_budget_revisions.company_id AND s.status='active')
    );
REVOKE ALL ON public.bt_purchase_budget_revisions FROM PUBLIC,anon,authenticated;
GRANT SELECT, INSERT ON public.bt_purchase_budget_revisions TO authenticated;

-- All material additions are atomic. A replacement only supersedes the
-- initial estimate; it never erases extensions or purchase orders.
CREATE FUNCTION public.bt_purchase_add_budget_revision(
    p_company_id uuid,
    p_site_id bigint,
    p_kind text,
    p_label text,
    p_source_name text,
    p_file_sha256 text,
    p_lines jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $fn$
DECLARE
    v_budget_id uuid;
    v_revision_id uuid;
    v_no integer;
    v_total numeric(18,2);
    v_hash text;
BEGIN
    IF NOT public.bt_stage2_is_admin(p_company_id) THEN
        RAISE EXCEPTION 'Administrateur requis' USING ERRCODE='42501';
    END IF;
    IF p_kind NOT IN ('replacement','extension')
       OR length(btrim(coalesce(p_label,''))) NOT BETWEEN 1 AND 150
       OR length(btrim(coalesce(p_source_name,''))) NOT BETWEEN 1 AND 250 THEN
        RAISE EXCEPTION 'Type, libellé ou fichier invalide';
    END IF;
    v_hash := nullif(lower(btrim(coalesce(p_file_sha256,''))), '');
    IF v_hash IS NOT NULL AND v_hash !~ '^[a-f0-9]{64}$' THEN
        RAISE EXCEPTION 'Empreinte SHA-256 invalide';
    END IF;
    IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array'
        OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 5000 THEN
        RAISE EXCEPTION 'Liste invalide (1 à 5000 articles)';
    END IF;

    -- Advisory lock serializes two concurrent uploads to the same project.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':' || p_site_id::text, 71845));
    SELECT b.id INTO v_budget_id
    FROM public.bt_purchase_budgets b
    JOIN public.sites s ON s.id=b.site_id AND s.company_id=b.company_id
    WHERE b.company_id=p_company_id AND b.site_id=p_site_id AND s.status='active';
    IF v_budget_id IS NULL THEN
        RAISE EXCEPTION 'Importer le budget initial avant une révision ou un avenant' USING ERRCODE='42501';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_lines) AS l(
            item_code text, description text, unit text,
            quantity numeric, unit_cost numeric, amount numeric)
        WHERE btrim(coalesce(l.description,'')) = ''
           OR btrim(coalesce(l.unit,'')) = ''
           OR l.quantity IS NULL OR l.quantity <= 0 OR l.quantity > 99999999999
           OR l.unit_cost IS NULL OR l.unit_cost < 0
           OR l.amount IS NULL OR l.amount < 0
    ) THEN
        RAISE EXCEPTION 'Article, quantité ou coût invalide';
    END IF;

    SELECT round(sum(l.amount),2) INTO v_total
    FROM jsonb_to_recordset(p_lines) AS l(amount numeric);
    SELECT coalesce(max(r.revision_no),0)+1 INTO v_no
    FROM public.bt_purchase_budget_revisions r WHERE r.budget_id=v_budget_id;

    INSERT INTO public.bt_purchase_budget_revisions(
        budget_id,company_id,site_id,revision_no,kind,label,source_name,
        file_sha256,line_count,total_amount,created_by)
    VALUES(v_budget_id,p_company_id,p_site_id,v_no,p_kind,btrim(p_label),
        btrim(p_source_name),v_hash,jsonb_array_length(p_lines),v_total,auth.uid())
    RETURNING id INTO v_revision_id;

    INSERT INTO public.bt_purchase_budget_lines(
        budget_id,company_id,site_id,revision_id,item_code,description,
        unit,quantity,unit_cost,amount)
    SELECT v_budget_id,p_company_id,p_site_id,v_revision_id,
        coalesce(l.item_code,''),l.description,l.unit,l.quantity,l.unit_cost,l.amount
    FROM jsonb_to_recordset(p_lines) AS l(
        item_code text, description text,unit text,
        quantity numeric,unit_cost numeric,amount numeric);
    RETURN v_revision_id;
END
$fn$;

-- Single source of truth for the active estimate:
-- latest replacement (or original if none) + ALL appended extensions.
CREATE FUNCTION public.bt_purchase_effective_budget_lines(
    p_company_id uuid, p_site_id bigint
) RETURNS SETOF public.bt_purchase_budget_lines
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $fn$
    SELECT l.*
    FROM public.bt_purchase_budget_lines l
    WHERE l.company_id=p_company_id AND l.site_id=p_site_id
      AND (
       (l.revision_id IS NULL AND NOT EXISTS(
          SELECT 1 FROM public.bt_purchase_budget_revisions r
          WHERE r.budget_id=l.budget_id AND r.kind='replacement'))
       OR l.revision_id=(
          SELECT r.id FROM public.bt_purchase_budget_revisions r
          WHERE r.budget_id=l.budget_id AND r.kind='replacement'
          ORDER BY r.revision_no DESC LIMIT 1)
       OR EXISTS(
          SELECT 1 FROM public.bt_purchase_budget_revisions r
          WHERE r.id=l.revision_id AND r.kind='extension')
      )
    ORDER BY l.id
$fn$;

REVOKE ALL ON FUNCTION public.bt_purchase_add_budget_revision(uuid,bigint,text,text,text,text,jsonb)
    FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.bt_purchase_effective_budget_lines(uuid,bigint)
    FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bt_purchase_add_budget_revision(uuid,bigint,text,text,text,text,jsonb)
    TO authenticated;
GRANT EXECUTE ON FUNCTION public.bt_purchase_effective_budget_lines(uuid,bigint)
    TO authenticated;

COMMIT;
