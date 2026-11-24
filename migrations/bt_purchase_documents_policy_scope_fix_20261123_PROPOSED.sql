-- Correct object-name binding in nested SQL policies:
-- unqualified name previously resolved to public.sites.name.
BEGIN;
DROP POLICY IF EXISTS bt_purchase_pdfs_read ON storage.objects;
DROP POLICY IF EXISTS bt_purchase_pdfs_insert ON storage.objects;
DROP POLICY IF EXISTS bt_purchase_pdfs_orphan_cleanup ON storage.objects;
CREATE POLICY bt_purchase_pdfs_read ON storage.objects FOR SELECT TO authenticated
 USING (
  bucket_id='bt-purchase-pdfs'
  AND EXISTS (
   SELECT 1 FROM public.sites s
   WHERE s.company_id::text=(storage.foldername(storage.objects.name))[1]
    AND s.id::text=(storage.foldername(storage.objects.name))[2]
    AND public.bt_stage2_is_admin(s.company_id)
    AND (
     ((storage.foldername(storage.objects.name))[3]='quote' AND EXISTS(
       SELECT 1 FROM public.bt_supplier_price_quotes q
       WHERE q.id::text=(storage.foldername(storage.objects.name))[4]
        AND q.company_id=s.company_id AND q.site_id=s.id))
     OR
     ((storage.foldername(storage.objects.name))[3]='order' AND EXISTS(
       SELECT 1 FROM public.bt_purchase_orders po
       WHERE po.id::text=(storage.foldername(storage.objects.name))[4]
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
   WHERE s.company_id::text=(storage.foldername(storage.objects.name))[1]
    AND s.id::text=(storage.foldername(storage.objects.name))[2]
    AND public.bt_stage2_is_admin(s.company_id)
    AND (
     ((storage.foldername(storage.objects.name))[3]='quote' AND EXISTS(
       SELECT 1 FROM public.bt_supplier_price_quotes q
       WHERE q.id::text=(storage.foldername(storage.objects.name))[4]
        AND q.company_id=s.company_id AND q.site_id=s.id))
     OR
     ((storage.foldername(storage.objects.name))[3]='order' AND EXISTS(
       SELECT 1 FROM public.bt_purchase_orders po
       WHERE po.id::text=(storage.foldername(storage.objects.name))[4]
        AND po.company_id=s.company_id AND po.site_id=s.id))
    )
  )
 );

-- Permit removing only unregistered orphan objects after a failed metadata write.
CREATE POLICY bt_purchase_pdfs_orphan_cleanup ON storage.objects FOR DELETE TO authenticated
 USING (
  bucket_id='bt-purchase-pdfs'
  AND EXISTS(SELECT 1 FROM public.sites s
   WHERE s.company_id::text=(storage.foldername(storage.objects.name))[1]
    AND s.id::text=(storage.foldername(storage.objects.name))[2]
    AND public.bt_stage2_is_admin(s.company_id))
  AND NOT EXISTS(
   SELECT 1 FROM public.bt_purchase_documents d
   WHERE d.storage_path=name)
 );
COMMIT;
