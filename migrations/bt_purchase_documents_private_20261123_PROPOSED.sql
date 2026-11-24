-- BuildTrack immutable original supplier PDF archive (quotes and confirmed orders).
-- Private storage: no public URLs, no anonymous read or write. Rollout separately.
BEGIN;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('bt-purchase-pdfs','bt-purchase-pdfs',false,15728640,ARRAY['application/pdf'])
ON CONFLICT(id) DO NOTHING;

CREATE TABLE public.bt_purchase_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL REFERENCES public.companies(id),
 site_id bigint NOT NULL REFERENCES public.sites(id) ON DELETE RESTRICT,
 source_kind text NOT NULL CHECK(source_kind IN ('quote','order')),
 source_id uuid NOT NULL,
 file_name text NOT NULL CHECK(length(btrim(file_name)) BETWEEN 1 AND 250),
 storage_path text NOT NULL UNIQUE,
 file_sha256 text NOT NULL CHECK(file_sha256 ~ '^[0-9a-f]{64}$'),
 file_size bigint NOT NULL CHECK(file_size BETWEEN 10 AND 15728640),
 uploaded_by uuid NOT NULL REFERENCES auth.users(id),
 uploaded_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT bt_purchase_documents_one_source UNIQUE(source_kind,source_id),
 CONSTRAINT bt_purchase_documents_path CHECK(
   storage_path LIKE company_id::text || '/' || site_id::text ||
    '/' || source_kind || '/' || source_id::text || '/%.pdf')
);
CREATE INDEX bt_purchase_documents_site ON
 public.bt_purchase_documents(company_id,site_id,source_kind);

ALTER TABLE public.bt_purchase_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY bt_purchase_documents_read ON public.bt_purchase_documents
 FOR SELECT TO authenticated USING(
  public.bt_stage2_is_admin(company_id)
  AND EXISTS(SELECT 1 FROM public.sites s
   WHERE s.id=bt_purchase_documents.site_id AND s.company_id=bt_purchase_documents.company_id)
 );

CREATE POLICY bt_purchase_documents_insert ON public.bt_purchase_documents
 FOR INSERT TO authenticated WITH CHECK(
  public.bt_stage2_is_admin(company_id)
  AND uploaded_by=(SELECT auth.uid())
  AND EXISTS(SELECT 1 FROM public.sites s
   WHERE s.id=bt_purchase_documents.site_id AND s.company_id=bt_purchase_documents.company_id)
  AND (
    (source_kind='quote' AND EXISTS(
      SELECT 1 FROM public.bt_supplier_price_quotes q
      WHERE q.id=bt_purchase_documents.source_id
        AND q.company_id=bt_purchase_documents.company_id
        AND q.site_id=bt_purchase_documents.site_id
    )) OR
    (source_kind='order' AND EXISTS(
      SELECT 1 FROM public.bt_purchase_orders o
      WHERE o.id=bt_purchase_documents.source_id
        AND o.company_id=bt_purchase_documents.company_id
        AND o.site_id=bt_purchase_documents.site_id
    ))
  )
  AND EXISTS(
    SELECT 1 FROM storage.objects obj
    WHERE obj.bucket_id='bt-purchase-pdfs' AND obj.name=bt_purchase_documents.storage_path
  )
 );

REVOKE ALL ON public.bt_purchase_documents FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.bt_purchase_documents TO authenticated;

-- Folder name: <company_uuid>/<site_id>/<quote|order>/<source_uuid>/<random_uuid>.pdf
-- Binding the source UUID to an actual record prevents cross-tenant spoofed paths.
CREATE POLICY bt_purchase_pdfs_read ON storage.objects FOR SELECT TO authenticated
 USING (
  bucket_id='bt-purchase-pdfs'
  AND EXISTS (
   SELECT 1 FROM public.sites s
   WHERE s.company_id::text=(storage.foldername(name))[1]
    AND s.id::text=(storage.foldername(name))[2]
    AND public.bt_stage2_is_admin(s.company_id)
    AND (
     ((storage.foldername(name))[3]='quote' AND EXISTS(
       SELECT 1 FROM public.bt_supplier_price_quotes q
       WHERE q.id::text=(storage.foldername(name))[4]
        AND q.company_id=s.company_id AND q.site_id=s.id))
     OR
     ((storage.foldername(name))[3]='order' AND EXISTS(
       SELECT 1 FROM public.bt_purchase_orders po
       WHERE po.id::text=(storage.foldername(name))[4]
        AND po.company_id=s.company_id AND po.site_id=s.id))
    )
  )
 );

CREATE POLICY bt_purchase_pdfs_insert ON storage.objects FOR INSERT TO authenticated
 WITH CHECK(
  bucket_id='bt-purchase-pdfs'
  AND name ~ '^[0-9a-f-]+/[0-9]+/(quote|order)/[0-9a-f-]+/[0-9a-f-]+[.]pdf$'
  AND EXISTS (
   SELECT 1 FROM public.sites s
   WHERE s.company_id::text=(storage.foldername(name))[1]
    AND s.id::text=(storage.foldername(name))[2]
    AND public.bt_stage2_is_admin(s.company_id)
    AND (
     ((storage.foldername(name))[3]='quote' AND EXISTS(
       SELECT 1 FROM public.bt_supplier_price_quotes q
       WHERE q.id::text=(storage.foldername(name))[4]
        AND q.company_id=s.company_id AND q.site_id=s.id))
     OR
     ((storage.foldername(name))[3]='order' AND EXISTS(
       SELECT 1 FROM public.bt_purchase_orders po
       WHERE po.id::text=(storage.foldername(name))[4]
        AND po.company_id=s.company_id AND po.site_id=s.id))
    )
  )
 );

-- Permit removing only unregistered orphan objects after a failed metadata write.
CREATE POLICY bt_purchase_pdfs_orphan_cleanup ON storage.objects FOR DELETE TO authenticated
 USING (
  bucket_id='bt-purchase-pdfs'
  AND EXISTS(SELECT 1 FROM public.sites s
   WHERE s.company_id::text=(storage.foldername(name))[1]
    AND s.id::text=(storage.foldername(name))[2]
    AND public.bt_stage2_is_admin(s.company_id))
  AND NOT EXISTS(
   SELECT 1 FROM public.bt_purchase_documents d
   WHERE d.storage_path=name)
 );
COMMIT;
