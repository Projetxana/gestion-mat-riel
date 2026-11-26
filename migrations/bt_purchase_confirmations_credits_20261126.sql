BEGIN;

ALTER TABLE public.bt_purchase_orders
    ADD COLUMN document_kind text NOT NULL DEFAULT 'order' CHECK (document_kind IN ('order', 'credit')),
    ADD COLUMN file_sha256 text CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),
    ADD COLUMN original_supplier_order_number text;

DROP INDEX public.bt_purchase_unique_supplier_po;
CREATE UNIQUE INDEX bt_purchase_legacy_supplier_po ON public.bt_purchase_orders
    (company_id, lower(btrim(supplier)), upper(regexp_replace(po_number, '[[:space:]]+', '', 'g')))
    WHERE file_sha256 IS NULL;
CREATE UNIQUE INDEX bt_purchase_document_sha ON public.bt_purchase_orders (company_id, file_sha256)
    WHERE file_sha256 IS NOT NULL;
CREATE UNIQUE INDEX bt_purchase_document_reference ON public.bt_purchase_orders
    (company_id, lower(btrim(supplier)), document_kind, upper(regexp_replace(supplier_order_number, '[[:space:]]+', '', 'g')))
    WHERE file_sha256 IS NOT NULL AND btrim(supplier_order_number) <> '';

ALTER TABLE public.bt_purchase_order_lines
    DROP CONSTRAINT bt_purchase_order_lines_quantity_check,
    DROP CONSTRAINT bt_purchase_order_lines_amount_check,
    ADD CONSTRAINT bt_purchase_order_line_sign CHECK (
        (quantity > 0 AND amount >= 0) OR (quantity < 0 AND amount <= 0)
    );

CREATE FUNCTION public.bt_purchase_validate_line_kind() RETURNS trigger
LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
    IF (NEW.quantity < 0) IS DISTINCT FROM (
        SELECT o.document_kind = 'credit' FROM public.bt_purchase_orders o
        WHERE (o.id, o.company_id, o.site_id) = (NEW.order_id, NEW.company_id, NEW.site_id)
    ) THEN
        RAISE EXCEPTION 'Signe de ligne incompatible avec le document' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER bt_purchase_validate_line_kind BEFORE INSERT OR UPDATE ON public.bt_purchase_order_lines
    FOR EACH ROW EXECUTE FUNCTION public.bt_purchase_validate_line_kind();

-- Cached clients retain the original import RPC and its legacy PO index.
ALTER FUNCTION public.bt_purchase_create_order(uuid,bigint,text,text,text,text,date,text,boolean,text,jsonb)
    SECURITY DEFINER;
REVOKE INSERT ON public.bt_purchase_orders, public.bt_purchase_order_lines FROM authenticated;

-- Upload first under the future order ID. Use a separate policy so historical
-- archived paths and quote permissions remain compatible.
CREATE POLICY bt_purchase_pdf_stage ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'bt-purchase-pdfs'
    AND name ~ '^[0-9a-f-]+/[0-9]+/order/[0-9a-f-]+/original[.]pdf$'
    AND EXISTS (
        SELECT 1 FROM public.sites s
        WHERE s.company_id::text = (storage.foldername(storage.objects.name))[1]
          AND s.id::text = (storage.foldername(storage.objects.name))[2]
          AND s.status = 'active' AND public.bt_stage2_is_admin(s.company_id)
    )
);

CREATE POLICY bt_purchase_pdf_stage_read ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'bt-purchase-pdfs' AND owner_id = (SELECT auth.uid())::text
    AND name ~ '^[0-9a-f-]+/[0-9]+/order/[0-9a-f-]+/original[.]pdf$'
    AND EXISTS (
        SELECT 1 FROM public.sites s
        WHERE s.company_id::text = (storage.foldername(storage.objects.name))[1]
          AND s.id::text = (storage.foldername(storage.objects.name))[2]
          AND public.bt_stage2_is_admin(s.company_id)
    )
);

-- Serialize legacy and current writers for the same supplier reference.
-- Existing historical duplicates are left intact.
CREATE FUNCTION public.bt_purchase_guard_reference() RETURNS trigger
LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE
    v_supplier text := lower(btrim(NEW.supplier));
    v_ref text := upper(regexp_replace(NEW.supplier_order_number, '[[:space:]]+', '', 'g'));
BEGIN
    IF v_ref = '' THEN RETURN NEW; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(
        jsonb_build_array(NEW.company_id, v_supplier, NEW.document_kind, v_ref)::text, 0
    ));
    IF EXISTS (
        SELECT 1 FROM public.bt_purchase_orders o
        WHERE o.company_id = NEW.company_id AND o.document_kind = NEW.document_kind
          AND lower(btrim(o.supplier)) = v_supplier
          AND upper(regexp_replace(o.supplier_order_number, '[[:space:]]+', '', 'g')) = v_ref
    ) THEN
        RAISE EXCEPTION 'Document fournisseur déjà importé' USING ERRCODE = '23505';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER bt_purchase_guard_reference BEFORE INSERT ON public.bt_purchase_orders
    FOR EACH ROW EXECUTE FUNCTION public.bt_purchase_guard_reference();

CREATE FUNCTION public.bt_purchase_import_document(
    p_company_id uuid, p_site_id bigint, p_document_id uuid, p_kind text,
    p_po_number text, p_supplier text, p_supplier_order_number text,
    p_original_supplier_order_number text, p_shipping_project_name text,
    p_override_confirmation text, p_file_name text, p_file_sha256 text,
    p_file_size bigint, p_lines jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_site_name text;
    v_path text;
    v_reference text := upper(regexp_replace(coalesce(p_supplier_order_number, ''), '[[:space:]]+', '', 'g'));
BEGIN
    IF auth.uid() IS NULL OR public.bt_stage2_is_admin(p_company_id) IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Administrateur requis' USING ERRCODE = '42501';
    END IF;
    SELECT name INTO v_site_name FROM public.sites
    WHERE id = p_site_id AND company_id = p_company_id AND status = 'active' FOR SHARE;
    IF v_site_name IS NULL THEN
        RAISE EXCEPTION 'Chantier indisponible' USING ERRCODE = '42501';
    END IF;
    IF lower(regexp_replace(btrim(coalesce(p_shipping_project_name, '')), '[[:space:][:punct:]]+', '', 'g'))
       <> lower(regexp_replace(btrim(v_site_name), '[[:space:][:punct:]]+', '', 'g'))
       AND lower(btrim(coalesce(p_override_confirmation, ''))) <> lower(btrim(v_site_name)) THEN
        RAISE EXCEPTION 'Confirmez le chantier de livraison';
    END IF;
    IF p_kind IS NULL OR p_kind NOT IN ('order', 'credit')
       OR (p_kind = 'credit' AND v_reference = '')
       OR p_file_sha256 IS NULL OR p_file_sha256 !~ '^[0-9a-f]{64}$'
       OR jsonb_typeof(p_lines) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Document invalide' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(p_lines) NOT BETWEEN 1 AND 5000 THEN
        RAISE EXCEPTION 'Lignes invalides' USING ERRCODE = '22023';
    END IF;

    -- Detect repeats from old archived PDFs and supplier references too, even
    -- when those historical rows predate document identities.
    IF EXISTS (
        SELECT 1 FROM public.bt_purchase_documents d
        WHERE d.company_id = p_company_id AND d.source_kind = 'order' AND d.file_sha256 = p_file_sha256
    ) THEN
        RAISE EXCEPTION 'Document fournisseur déjà importé' USING ERRCODE = '23505';
    END IF;

    v_path := p_company_id::text || '/' || p_site_id::text || '/order/' || p_document_id::text || '/original.pdf';
    PERFORM 1 FROM storage.objects
     WHERE bucket_id = 'bt-purchase-pdfs' AND name = v_path
       AND owner_id = auth.uid()::text AND metadata->>'size' = p_file_size::text
       AND metadata->>'mimetype' = 'application/pdf'
       AND archived_at IS NULL AND is_delete_marker IS DISTINCT FROM true
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'PDF original absent ou invalide';
    END IF;

    INSERT INTO public.bt_purchase_orders
        (id, company_id, site_id, po_number, supplier, supplier_order_number, shipping_project_name,
         source_name, project_verified_by, document_kind, file_sha256, original_supplier_order_number)
    VALUES (p_document_id, p_company_id, p_site_id, btrim(p_po_number), btrim(p_supplier),
            btrim(coalesce(p_supplier_order_number, '')), btrim(p_shipping_project_name),
            left(p_file_name, 150), auth.uid(), p_kind, p_file_sha256,
            nullif(btrim(p_original_supplier_order_number), ''));

    INSERT INTO public.bt_purchase_order_lines
        (order_id, company_id, site_id, item_code, description, unit, quantity, unit_cost, amount)
    SELECT p_document_id, p_company_id, p_site_id, coalesce(l.item_code, ''),
           l.description, l.unit, l.quantity, l.unit_cost, l.amount
      FROM jsonb_to_recordset(p_lines) AS l(item_code text, description text, unit text,
           quantity numeric, unit_cost numeric, amount numeric);

    -- Reuse only an unambiguous saved link on the referenced confirmation,
    -- restricted to the same project, PO and supplier.
    IF p_kind = 'credit' AND btrim(coalesce(p_original_supplier_order_number, '')) <> '' THEN
        INSERT INTO public.bt_purchase_line_links
            (order_line_id, budget_line_id, company_id, site_id, disposition, created_by)
        SELECT credit.id, min(link.budget_line_id), p_company_id, p_site_id, min(link.disposition), auth.uid()
        FROM public.bt_purchase_order_lines credit
        JOIN public.bt_purchase_orders original
          ON original.company_id = credit.company_id AND original.site_id = credit.site_id
         AND original.document_kind = 'order'
         AND lower(btrim(original.supplier)) = lower(btrim(p_supplier))
         AND upper(regexp_replace(original.po_number, '[[:space:]]+', '', 'g'))
             = upper(regexp_replace(p_po_number, '[[:space:]]+', '', 'g'))
         AND upper(regexp_replace(original.supplier_order_number, '[[:space:]]+', '', 'g'))
             = upper(regexp_replace(p_original_supplier_order_number, '[[:space:]]+', '', 'g'))
        JOIN public.bt_purchase_order_lines source ON source.order_id = original.id
         AND upper(btrim(credit.item_code)) = upper(btrim(source.item_code))
         AND public.bt_purchase_unit_key(credit.unit) = public.bt_purchase_unit_key(source.unit)
        LEFT JOIN public.bt_purchase_line_links link ON link.order_line_id = source.id
        WHERE credit.order_id = p_document_id AND btrim(credit.item_code) <> ''
        GROUP BY credit.id
        HAVING count(link.order_line_id) = count(*)
           AND count(DISTINCT (link.disposition, link.budget_line_id)) = 1;
    END IF;

    INSERT INTO public.bt_purchase_documents
        (company_id, site_id, source_kind, source_id, file_name, storage_path, file_sha256, file_size, uploaded_by)
    VALUES (p_company_id, p_site_id, 'order', p_document_id, p_file_name, v_path, p_file_sha256, p_file_size, auth.uid());
    RETURN p_document_id;
END;
$$;

REVOKE ALL ON FUNCTION public.bt_purchase_import_document(uuid,bigint,uuid,text,text,text,text,text,text,text,text,text,bigint,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bt_purchase_import_document(uuid,bigint,uuid,text,text,text,text,text,text,text,text,text,bigint,jsonb) TO authenticated;
-- Every recorded, verified shipping name is evidence for its company and supplier.
-- A name seen under multiple projects requires explicit confirmation each time.
CREATE FUNCTION public.bt_purchase_matches_project_alias(
    p_company_id uuid, p_site_id bigint, p_supplier text, p_shipping_project_name text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
    SELECT public.bt_stage2_is_admin(p_company_id)
       AND coalesce(bool_and(o.site_id = p_site_id), false)
    FROM public.bt_purchase_orders o
    WHERE o.company_id = p_company_id
      AND lower(btrim(o.supplier)) = lower(btrim(p_supplier))
      AND lower(regexp_replace(o.shipping_project_name, '[[:space:][:punct:]]+', '', 'g'))
          = lower(regexp_replace(p_shipping_project_name, '[[:space:][:punct:]]+', '', 'g'));
$$;
REVOKE ALL ON FUNCTION public.bt_purchase_matches_project_alias(uuid,bigint,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bt_purchase_matches_project_alias(uuid,bigint,text,text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
