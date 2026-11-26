BEGIN;

ALTER TABLE public.bt_purchase_order_lines
    ADD COLUMN supplier_item_code text CHECK (length(supplier_item_code)<=100);

CREATE TABLE public.bt_purchase_inbox (
    id uuid PRIMARY KEY,
    company_id uuid NOT NULL REFERENCES public.companies(id),
    site_id bigint NOT NULL REFERENCES public.sites(id),
    actor_id uuid NOT NULL REFERENCES auth.users(id),
    file_sha256 text NOT NULL CHECK (file_sha256 ~ '^[a-f0-9]{64}$'),
    file_name text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 250),
    storage_path text NOT NULL UNIQUE,
    file_size bigint NOT NULL CHECK (file_size BETWEEN 50 AND 12582912),
    kind text NOT NULL CHECK (kind IN ('quotation','estimate','order','credit','invoice','delivery')),
    supplier text NOT NULL,
    reference text NOT NULL,
    project_name text NOT NULL,
    status text NOT NULL CHECK (status IN ('imported','duplicate')),
    budget_mode text CHECK (budget_mode IN ('initial','replacement','extension','price_only','recovered')),
    revision_id uuid REFERENCES public.bt_purchase_budget_revisions(id),
    quote_id uuid REFERENCES public.bt_supplier_price_quotes(id),
    order_id uuid REFERENCES public.bt_purchase_orders(id),
    total numeric(18,2),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX bt_purchase_inbox_hash ON public.bt_purchase_inbox(company_id,file_sha256)
    WHERE status = 'imported';
CREATE UNIQUE INDEX bt_purchase_inbox_ref ON public.bt_purchase_inbox
    (company_id, lower(btrim(supplier)), kind, upper(regexp_replace(reference,'[[:space:]]+','','g')))
    WHERE status = 'imported' AND reference <> '' AND supplier <> '';
CREATE INDEX bt_purchase_inbox_site ON public.bt_purchase_inbox(company_id,site_id,created_at DESC);
ALTER TABLE public.bt_purchase_inbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bt_purchase_inbox FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.bt_purchase_inbox TO authenticated;
CREATE POLICY bt_purchase_inbox_read ON public.bt_purchase_inbox FOR SELECT TO authenticated
    USING(public.bt_stage2_is_admin(company_id));

CREATE TABLE public.bt_purchase_verification_receipts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id uuid NOT NULL,
    company_id uuid NOT NULL,
    site_id bigint NOT NULL,
    actor_id uuid NOT NULL,
    file_sha256 text NOT NULL,
    file_name text NOT NULL,
    file_size bigint NOT NULL,
    storage_path text NOT NULL,
    evidence jsonb NOT NULL,
    expires_at timestamptz NOT NULL DEFAULT now() + interval '20 minutes'
);
ALTER TABLE public.bt_purchase_verification_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bt_purchase_verification_receipts FROM PUBLIC,anon,authenticated;
GRANT INSERT, SELECT ON public.bt_purchase_verification_receipts TO service_role;

CREATE POLICY bt_purchase_inbox_read_pdf ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id='bt-purchase-pdfs' AND EXISTS (
        SELECT 1 FROM public.bt_purchase_inbox d
        WHERE d.storage_path = storage.objects.name AND d.status='imported'
          AND public.bt_stage2_is_admin(d.company_id)
    )
);
-- The legacy orphan policy only checks the legacy archive table.
CREATE POLICY bt_purchase_inbox_protect_pdf ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
USING (
    bucket_id <> 'bt-purchase-pdfs' OR NOT EXISTS (
        SELECT 1 FROM public.bt_purchase_inbox d WHERE d.storage_path = storage.objects.name
    )
);

CREATE FUNCTION public.bt_purchase_v2_budget_state(p_company_id uuid,p_site_id bigint)
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $$
 SELECT CASE WHEN b.id IS NULL THEN 'none'
   ELSE b.id::text || ':' || coalesce(max(r.revision_no),0)::text END
 FROM (SELECT 1) anchor
 LEFT JOIN public.bt_purchase_budgets b ON b.company_id=p_company_id AND b.site_id=p_site_id
 LEFT JOIN public.bt_purchase_budget_revisions r ON r.budget_id=b.id
 GROUP BY b.id
$$;
REVOKE ALL ON FUNCTION public.bt_purchase_v2_budget_state(uuid,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bt_purchase_v2_budget_state(uuid,bigint) TO authenticated;

CREATE FUNCTION public.bt_purchase_v2_pending(p_company_id uuid,p_site_id bigint)
RETURNS TABLE(document_id uuid,file_name text,storage_path text,file_sha256 text,kind text,project text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
 SELECT DISTINCT ON (r.document_id)
    r.document_id,r.file_name,r.storage_path,r.file_sha256,r.evidence->>'kind',r.evidence->>'project'
 FROM public.bt_purchase_verification_receipts r
 WHERE r.actor_id=auth.uid() AND r.company_id=p_company_id AND r.site_id=p_site_id
   AND public.bt_stage2_is_admin(p_company_id)
   AND r.expires_at>now()-interval '7 days'
   AND NOT EXISTS (SELECT 1 FROM public.bt_purchase_inbox d
     WHERE d.company_id=r.company_id AND d.file_sha256=r.file_sha256)
 ORDER BY r.document_id,r.expires_at DESC
$$;
REVOKE ALL ON FUNCTION public.bt_purchase_v2_pending(uuid,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bt_purchase_v2_pending(uuid,bigint) TO authenticated;

CREATE FUNCTION public.bt_purchase_commit_document_v2(
    p_receipt_id uuid, p_confirm_site boolean DEFAULT false, p_budget_mode text DEFAULT NULL,
    p_expected_budget_state text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
    r public.bt_purchase_verification_receipts%ROWTYPE;
    v_existing public.bt_purchase_inbox%ROWTYPE;
    v_plan jsonb;
    v_rows jsonb;
    v_kind text;
    v_supplier text;
    v_reference text;
    v_reference_key text;
    v_project text;
    v_site text;
    v_po text;
    v_mode text;
    v_state text;
    v_total numeric(18,2);
    v_revision uuid;
    v_quote uuid;
    v_order uuid;
    v_same_name boolean;
    v_other_site boolean;
    v_this_site boolean;
    v_name_key text;
BEGIN
    SELECT * INTO r FROM public.bt_purchase_verification_receipts WHERE id=p_receipt_id AND actor_id=auth.uid();
    IF NOT FOUND OR public.bt_stage2_is_admin(r.company_id) IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Vérification du document indisponible' USING ERRCODE='42501';
    END IF;
    SELECT name INTO v_site FROM public.sites WHERE id=r.site_id AND company_id=r.company_id AND status='active' FOR SHARE;
    IF v_site IS NULL THEN RAISE EXCEPTION 'Chantier inactif' USING ERRCODE='42501'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(r.company_id::text, 80210));
    SELECT * INTO v_existing FROM public.bt_purchase_inbox
        WHERE company_id=r.company_id AND file_sha256=r.file_sha256 AND status='imported';
    IF FOUND THEN
        IF v_existing.id = r.document_id AND v_existing.site_id=r.site_id THEN
            RETURN jsonb_build_object('status','imported','documentId',v_existing.id,'total',v_existing.total);
        END IF;
        RETURN jsonb_build_object('status','duplicate');
    END IF;
    IF r.expires_at < now() THEN RAISE EXCEPTION 'Vérification expirée. Réessayez le document.'; END IF;
    v_plan := r.evidence;
    v_kind := v_plan->>'kind';
    v_rows := v_plan->'rows';
    v_supplier := coalesce(v_plan->>'supplier','');
    v_reference := coalesce(v_plan->>'reference','');
    v_reference_key := upper(regexp_replace(v_reference,'[[:space:]]+','','g'));
    v_project := coalesce(v_plan->>'project','');
    v_po := coalesce(v_plan->>'po','');
    v_name_key := lower(regexp_replace(v_project,'[[:space:][:punct:]]+','','g'));
    IF r.storage_path IS DISTINCT FROM r.company_id::text||'/'||r.site_id::text||'/order/'||r.document_id::text||'/original.pdf'
       OR v_plan->>'sha256' IS DISTINCT FROM r.file_sha256 OR v_kind IS NULL
       OR v_kind NOT IN ('quotation','estimate','order','credit','invoice','delivery') THEN
        RAISE EXCEPTION 'Vérification incohérente';
    END IF;
    IF EXISTS (SELECT 1 FROM public.bt_purchase_documents d WHERE d.company_id=r.company_id AND d.file_sha256=r.file_sha256)
       OR EXISTS (SELECT 1 FROM public.bt_purchase_orders o WHERE o.company_id=r.company_id AND o.file_sha256=r.file_sha256)
       OR EXISTS (SELECT 1 FROM public.bt_supplier_price_quotes q WHERE q.company_id=r.company_id AND q.file_sha256=r.file_sha256)
       OR EXISTS (SELECT 1 FROM public.bt_purchase_budget_revisions b WHERE b.company_id=r.company_id AND b.file_sha256=r.file_sha256) THEN
        RETURN jsonb_build_object('status','duplicate');
    END IF;
    IF v_supplier <> '' AND v_reference_key <> '' AND (
        EXISTS (SELECT 1 FROM public.bt_purchase_inbox d WHERE d.company_id=r.company_id
            AND d.kind=v_kind AND lower(btrim(d.supplier))=lower(btrim(v_supplier))
            AND upper(regexp_replace(d.reference,'[[:space:]]+','','g'))=v_reference_key)
        OR EXISTS (SELECT 1 FROM public.bt_purchase_orders o WHERE o.company_id=r.company_id
            AND o.document_kind=v_kind AND lower(btrim(o.supplier))=lower(btrim(v_supplier))
            AND upper(regexp_replace(o.supplier_order_number,'[[:space:]]+','','g'))=v_reference_key)
        OR (v_kind='quotation' AND EXISTS (
            SELECT 1 FROM public.bt_supplier_price_quotes q WHERE q.company_id=r.company_id
              AND lower(btrim(q.supplier))=lower(btrim(v_supplier))
              AND upper(regexp_replace(q.quote_number,'[[:space:]]+','','g'))=v_reference_key))
    ) THEN
        RETURN jsonb_build_object('status','review','issues',jsonb_build_array('reference_conflict'));
    END IF;

    v_same_name := length(v_name_key)>=3 AND v_name_key=lower(regexp_replace(v_site,'[[:space:][:punct:]]+','','g'));
    SELECT coalesce(bool_or(known.site_id=r.site_id),false), coalesce(bool_or(known.site_id<>r.site_id),false)
    INTO v_this_site,v_other_site
    FROM (
        SELECT o.site_id,o.supplier,o.shipping_project_name AS project
        FROM public.bt_purchase_orders o WHERE o.company_id=r.company_id
        UNION ALL
        SELECT d.site_id,d.supplier,d.project_name FROM public.bt_purchase_inbox d WHERE d.company_id=r.company_id
    ) known
    WHERE length(v_name_key)>=3 AND lower(btrim(known.supplier))=lower(btrim(v_supplier))
      AND lower(regexp_replace(known.project,'[[:space:][:punct:]]+','','g'))=v_name_key;
    IF (v_other_site OR NOT (v_same_name OR v_this_site)) AND p_confirm_site IS DISTINCT FROM true THEN
        RETURN jsonb_build_object('status','confirm','issues',jsonb_build_array('confirm_site'),'project',v_project);
    END IF;

    IF v_kind IN ('quotation','estimate') THEN
        PERFORM pg_advisory_xact_lock(hashtextextended(r.company_id::text||':'||r.site_id::text,71845));
        v_state := public.bt_purchase_v2_budget_state(r.company_id,r.site_id);
        IF (v_state<>'none' AND p_budget_mode IS NULL)
           OR (p_expected_budget_state IS NOT NULL AND p_expected_budget_state<>v_state)
           OR (p_budget_mode IS NOT NULL AND p_expected_budget_state IS DISTINCT FROM v_state)
           OR (v_state='none' AND p_budget_mode IS NOT NULL) THEN
          RETURN jsonb_build_object('status','confirm','issues',jsonb_build_array('choose_revision'),
                'budgetState',v_state);
        END IF;
        v_mode := coalesce(p_budget_mode,'initial');
        IF v_mode NOT IN ('initial','replacement','extension','price_only','recovered')
           OR (v_mode='initial' AND v_state<>'none')
           OR (v_mode IN ('price_only','recovered') AND v_kind<>'quotation') THEN
          RAISE EXCEPTION 'Action budgétaire invalide';
        END IF;
    END IF;

    PERFORM 1 FROM storage.objects WHERE bucket_id='bt-purchase-pdfs'
      AND name=r.storage_path AND owner_id=auth.uid()::text AND metadata->>'size'=r.file_size::text
      AND metadata->>'mimetype'='application/pdf' AND archived_at IS NULL
      AND is_delete_marker IS DISTINCT FROM true FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PDF original absent ou invalide'; END IF;

    IF v_kind NOT IN ('invoice','delivery') THEN
        IF v_plan->>'currency' IS DISTINCT FROM 'CAD' OR jsonb_typeof(v_rows) IS DISTINCT FROM 'array'
           OR (v_kind IN ('order','credit','quotation') AND (v_supplier='' OR v_reference_key=''))
           OR (v_kind IN ('order','credit') AND v_po='') THEN RAISE EXCEPTION 'Document financier incomplet'; END IF;
        IF jsonb_array_length(v_rows) NOT BETWEEN 1 AND 5000 OR
           (v_plan->>'expectedCount')::integer IS DISTINCT FROM jsonb_array_length(v_rows) THEN
            RAISE EXCEPTION 'Lignes manquantes';
        END IF;
        IF EXISTS (
          SELECT 1 FROM jsonb_to_recordset(v_rows) AS l(item_code text,description text,unit text,
            quantity numeric,unit_cost numeric,amount numeric)
          WHERE nullif(btrim(l.item_code),'') IS NULL OR nullif(btrim(l.description),'') IS NULL
             OR nullif(btrim(l.unit),'') IS NULL OR l.quantity IS NULL OR l.unit_cost IS NULL OR l.amount IS NULL
             OR abs(l.quantity)>99999999999 OR abs(l.amount)>9999999999999 OR l.unit_cost NOT BETWEEN 0 AND 99999999999
             OR l.quantity<>round(l.quantity,3) OR l.unit_cost<>round(l.unit_cost,4) OR l.amount<>round(l.amount,2)
             OR (v_kind='credit' AND (l.quantity>=0 OR l.amount>0))
             OR (v_kind<>'credit' AND (l.quantity<=0 OR l.amount<0))
             OR abs(round(l.quantity*l.unit_cost,2)-l.amount)>0.02
        ) THEN RAISE EXCEPTION 'Article, signe ou montant incohérent'; END IF;
        SELECT sum(amount) INTO v_total FROM jsonb_to_recordset(v_rows) AS l(amount numeric);
        IF v_plan->>'printedTotal' IS NULL
           OR abs(v_total-(v_plan->>'printedTotal')::numeric)>0.02 THEN RAISE EXCEPTION 'Sous-total incohérent'; END IF;
    END IF;

    IF v_mode='recovered' AND EXISTS (
        (SELECT item_code,unit,quantity,unit_cost,amount FROM jsonb_to_recordset(v_rows)
         AS l(item_code text,unit text,quantity numeric,unit_cost numeric,amount numeric)
         EXCEPT ALL
         SELECT l.item_code,l.unit,l.quantity,l.unit_cost,l.amount
         FROM public.bt_purchase_budget_lines l WHERE l.company_id=r.company_id AND l.site_id=r.site_id AND l.revision_id IS NULL)
        UNION ALL
        (SELECT l.item_code,l.unit,l.quantity,l.unit_cost,l.amount
         FROM public.bt_purchase_budget_lines l WHERE l.company_id=r.company_id AND l.site_id=r.site_id AND l.revision_id IS NULL
         EXCEPT ALL
         SELECT item_code,unit,quantity,unit_cost,amount FROM jsonb_to_recordset(v_rows)
         AS l(item_code text,unit text,quantity numeric,unit_cost numeric,amount numeric))
    ) THEN
        RAISE EXCEPTION 'La soumission ne correspond pas intégralement au budget historique';
    END IF;

    IF v_mode='initial' THEN
        PERFORM public.bt_purchase_import_budget(r.company_id,r.site_id,r.file_name,v_rows);
    ELSIF v_mode IN ('replacement','extension') THEN
        v_revision := public.bt_purchase_add_budget_revision(
            r.company_id,r.site_id,v_mode,left(r.file_name,150),r.file_name,r.file_sha256,v_rows);
    END IF;
    IF v_kind='quotation' THEN
        v_quote := public.bt_supplier_price_register(r.company_id,r.site_id,v_supplier,v_reference,
            (v_plan->>'quoteDate')::date,r.file_name,r.file_sha256,v_total,v_rows,true);
    ELSIF v_kind IN ('order','credit') THEN
        v_order := public.bt_purchase_import_document(r.company_id,r.site_id,r.document_id,v_kind,v_po,v_supplier,v_reference,
            coalesce(v_plan->>'originalReference',''),coalesce(nullif(v_project,''),v_site),v_site,r.file_name,
            r.file_sha256,r.file_size,v_rows);
        WITH inserted AS (
            SELECT id,row_number() OVER (ORDER BY id) AS position
            FROM public.bt_purchase_order_lines WHERE order_id=v_order
        ), extracted AS (
            SELECT ordinality, nullif(btrim(value->>'supplier_code'),'') AS supplier_code
            FROM jsonb_array_elements(v_rows) WITH ORDINALITY
        )
        UPDATE public.bt_purchase_order_lines line SET supplier_item_code=extracted.supplier_code
        FROM inserted JOIN extracted ON extracted.ordinality=inserted.position
        WHERE line.id=inserted.id AND extracted.supplier_code IS NOT NULL;
    END IF;
    INSERT INTO public.bt_purchase_inbox(id,company_id,site_id,actor_id,file_sha256,file_name,storage_path,file_size,
        kind,supplier,reference,project_name,status,budget_mode,revision_id,quote_id,order_id,total)
    VALUES(r.document_id,r.company_id,r.site_id,r.actor_id,r.file_sha256,r.file_name,r.storage_path,r.file_size,
        v_kind,v_supplier,v_reference,v_project,'imported',v_mode,v_revision,v_quote,v_order,v_total);
    RETURN jsonb_build_object('status','imported','documentId',r.document_id,'total',v_total);
END;
$$;
REVOKE ALL ON FUNCTION public.bt_purchase_commit_document_v2(uuid,boolean,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bt_purchase_commit_document_v2(uuid,boolean,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
