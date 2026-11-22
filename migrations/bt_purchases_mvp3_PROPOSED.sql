-- MVP3 (PROPOSED) Secure private purchase documents and per-site email aliases.
-- Depends on both MVP1/MVP2 migrations. Run in disposable PostgreSQL first.
BEGIN;

CREATE TABLE public.bt_purchase_inbox_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  site_id bigint NOT NULL REFERENCES public.sites(id),
  alias_token text NOT NULL UNIQUE CHECK (alias_token ~ '^[0-9a-f]{32}$'),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id),
  UNIQUE (id,company_id,site_id)
);

CREATE TABLE public.bt_purchase_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  site_id bigint NOT NULL REFERENCES public.sites(id),
  inbox_alias_id uuid NOT NULL,
  source text NOT NULL DEFAULT 'email' CHECK (source='email'),
  sender_email text NOT NULL,
  email_message_id text NOT NULL DEFAULT '',
  original_filename text NOT NULL CHECK (length(original_filename) BETWEEN 1 AND 180),
  mime_type text NOT NULL CHECK (mime_type IN ('application/pdf','image/jpeg','image/png','image/webp')),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  storage_path text NOT NULL UNIQUE,
  extracted_text text NOT NULL DEFAULT '' CHECK (length(extracted_text)<=120000),
  po_hint text NOT NULL DEFAULT '',
  shipping_project_hint text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending_review' CHECK (status='pending_review'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(inbox_alias_id,company_id,site_id)
    REFERENCES public.bt_purchase_inbox_aliases(id,company_id,site_id),
  UNIQUE(company_id,sha256)
);

CREATE INDEX bt_purchase_documents_site ON public.bt_purchase_documents
 (company_id,site_id,created_at DESC);

ALTER TABLE public.bt_purchase_inbox_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bt_purchase_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY bt_purchase_aliases_admin_select ON public.bt_purchase_inbox_aliases
 FOR SELECT TO authenticated USING (public.bt_stage2_is_admin(company_id));
CREATE POLICY bt_purchase_aliases_admin_insert ON public.bt_purchase_inbox_aliases
 FOR INSERT TO authenticated WITH CHECK(
  public.bt_stage2_is_admin(company_id) AND created_by=(SELECT auth.uid())
  AND EXISTS(SELECT 1 FROM public.sites s
     WHERE s.id=bt_purchase_inbox_aliases.site_id
       AND s.company_id=bt_purchase_inbox_aliases.company_id AND s.status='active')
 );
CREATE POLICY bt_purchase_documents_admin_read ON public.bt_purchase_documents
 FOR SELECT TO authenticated USING (public.bt_stage2_is_admin(company_id));

REVOKE ALL ON public.bt_purchase_inbox_aliases,public.bt_purchase_documents
 FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.bt_purchase_inbox_aliases TO authenticated;
GRANT SELECT ON public.bt_purchase_documents TO authenticated;

CREATE OR REPLACE FUNCTION public.bt_purchase_get_inbox_alias(p_company_id uuid,p_site_id bigint)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $fn$
DECLARE v_alias text;
BEGIN
 IF NOT public.bt_stage2_is_admin(p_company_id)
   OR NOT EXISTS(SELECT 1 FROM public.sites s WHERE s.id=p_site_id
     AND s.company_id=p_company_id AND s.status='active') THEN
   RAISE EXCEPTION 'Administrateur ou chantier actif requis' USING ERRCODE='42501';
 END IF;
 SELECT a.alias_token INTO v_alias FROM public.bt_purchase_inbox_aliases a
  WHERE a.site_id=p_site_id AND a.company_id=p_company_id;
 IF v_alias IS NOT NULL THEN RETURN v_alias; END IF;
 INSERT INTO public.bt_purchase_inbox_aliases(company_id,site_id,alias_token,created_by)
 VALUES(p_company_id,p_site_id,replace(gen_random_uuid()::text,'-',''),auth.uid())
 ON CONFLICT(site_id) DO NOTHING;
 SELECT a.alias_token INTO v_alias FROM public.bt_purchase_inbox_aliases a
  WHERE a.site_id=p_site_id AND a.company_id=p_company_id;
 RETURN v_alias;
END
$fn$;
REVOKE ALL ON FUNCTION public.bt_purchase_get_inbox_alias(uuid,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bt_purchase_get_inbox_alias(uuid,bigint) TO authenticated;

-- Protected R2/Supabase Storage policies. Bucket remains non-public.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES(
   'bt-purchase-private','bt-purchase-private',false,8388608,
   ARRAY['application/pdf','image/jpeg','image/png','image/webp']
 )
 ON CONFLICT(id) DO NOTHING;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES(
   'bt-delivery-private','bt-delivery-private',false,8388608,
   ARRAY['image/jpeg','image/png','image/webp']
 )
 ON CONFLICT(id) DO NOTHING;

-- Only authenticated company admins can obtain protected purchase documents.
-- The content path uses: <company_uuid>/<site_id>/<sha256>.<ext>
CREATE POLICY bt_purchase_private_admin_read ON storage.objects
 FOR SELECT TO authenticated
 USING (
   bucket_id='bt-purchase-private'
   AND EXISTS(
     SELECT 1 FROM public.company_users cu
     WHERE cu.company_id::text=(storage.foldername(name))[1]
       AND cu.role='admin' AND cu.user_id=(SELECT auth.uid())
   )
 );

-- Delivery uploads: workers can upload ONLY into their own tenant/project/user path.
-- Content paths are <company_uuid>/<site_id>/<auth_uuid>/<unique>.jpg.
CREATE POLICY bt_delivery_private_worker_upload ON storage.objects
 FOR INSERT TO authenticated
 WITH CHECK (
   bucket_id='bt-delivery-private'
   AND (storage.foldername(name))[3]=(SELECT auth.uid())::text
   AND EXISTS(
     SELECT 1 FROM public.sites s
     JOIN public.company_users cu ON cu.company_id=s.company_id
     WHERE s.company_id::text=(storage.foldername(name))[1]
       AND s.id::text=(storage.foldername(name))[2]
       AND s.status='active'
       AND cu.user_id=(SELECT auth.uid())
   )
 );
CREATE POLICY bt_delivery_private_read ON storage.objects
 FOR SELECT TO authenticated USING (
   bucket_id='bt-delivery-private'
   AND EXISTS (
     SELECT 1 FROM public.sites s JOIN public.company_users cu
       ON cu.company_id=s.company_id
     WHERE s.company_id::text=(storage.foldername(name))[1]
       AND s.id::text=(storage.foldername(name))[2]
       AND cu.user_id=(SELECT auth.uid())
       AND (cu.role='admin' OR (storage.foldername(name))[3]=(SELECT auth.uid())::text)
   )
 );

-- New delivery flow: enforce private storage and server-confirmed accounting email.
-- Old public delivery-notes must be migrated separately before final public launch.
ALTER TABLE public.bt_purchase_delivery_notes
  DROP CONSTRAINT bt_purchase_delivery_notes_source_bucket_check,
  DROP CONSTRAINT bt_purchase_delivery_notes_status_check,
  DROP CONSTRAINT bt_delivery_note_verified_consistency;
ALTER TABLE public.bt_purchase_delivery_notes
  ALTER COLUMN email_sent_at DROP NOT NULL,
  ALTER COLUMN source_bucket SET DEFAULT 'bt-delivery-private',
  ALTER COLUMN status SET DEFAULT 'sending',
  ADD CONSTRAINT bt_delivery_note_bucket_allowed CHECK (
    source_bucket IN ('delivery-notes','bt-delivery-private')),
  ADD CONSTRAINT bt_delivery_note_status_allowed CHECK (
    status IN ('sending','send_failed','pending_review','verified')),
  ADD CONSTRAINT bt_delivery_note_verified_consistency CHECK (
    (status IN ('sending','send_failed') AND email_sent_at IS NULL AND verified_at IS NULL AND order_id IS NULL)
    OR (status='pending_review' AND email_sent_at IS NOT NULL AND verified_at IS NULL AND order_id IS NULL)
    OR (status='verified' AND email_sent_at IS NOT NULL AND verified_at IS NOT NULL AND order_id IS NOT NULL)
  );
-- Only the authenticated Edge Function (service role) may reserve and finalize a
-- delivery email record; a browser must not assert that accounting got an email.
DROP POLICY bt_delivery_notes_insert ON public.bt_purchase_delivery_notes;
REVOKE INSERT ON public.bt_purchase_delivery_notes FROM authenticated;

COMMIT;
