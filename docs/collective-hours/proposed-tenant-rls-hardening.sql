-- CANDIDATE ONLY: do not execute in production without staging approval.
-- Expected BuildTrack database: hxjkhkpgacaioghcanhp
-- No data updates, deletes or inserts. Authorization changes may affect workflows.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '20s';

DO $$
BEGIN
 IF EXISTS (
  SELECT 1 FROM public.tasks t LEFT JOIN public.sites s ON s.id=t.site_id
  WHERE s.id IS NULL OR
        (t.company_id IS NOT NULL AND t.company_id IS DISTINCT FROM s.company_id)
 ) THEN RAISE EXCEPTION 'Legacy task ownership preflight failed'; END IF;
END $$;

DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.tasks;
DROP POLICY IF EXISTS "multi-tenant-safe" ON public.tasks;
CREATE POLICY bt_tasks_tenant_read ON public.tasks FOR SELECT TO authenticated
 USING (EXISTS (
  SELECT 1 FROM public.sites s JOIN public.company_users cu ON cu.company_id=s.company_id
  WHERE s.id=tasks.site_id AND cu.user_id=(SELECT auth.uid())
    AND (tasks.company_id IS NULL OR tasks.company_id=s.company_id)
 ));
CREATE POLICY bt_tasks_tenant_insert ON public.tasks FOR INSERT TO authenticated
 WITH CHECK (EXISTS (
  SELECT 1 FROM public.sites s JOIN public.company_users cu ON cu.company_id=s.company_id
  WHERE s.id=tasks.site_id AND cu.user_id=(SELECT auth.uid())
    AND (tasks.company_id IS NULL OR tasks.company_id=s.company_id)
 ));
CREATE POLICY bt_tasks_tenant_update ON public.tasks FOR UPDATE TO authenticated
 USING (EXISTS (
  SELECT 1 FROM public.sites s JOIN public.company_users cu ON cu.company_id=s.company_id
  WHERE s.id=tasks.site_id AND cu.user_id=(SELECT auth.uid())
    AND (tasks.company_id IS NULL OR tasks.company_id=s.company_id)
 ))
 WITH CHECK (EXISTS (
  SELECT 1 FROM public.sites s JOIN public.company_users cu ON cu.company_id=s.company_id
  WHERE s.id=tasks.site_id AND cu.user_id=(SELECT auth.uid())
    AND (tasks.company_id IS NULL OR tasks.company_id=s.company_id)
 ));
CREATE POLICY bt_tasks_tenant_delete ON public.tasks FOR DELETE TO authenticated
 USING (EXISTS (
  SELECT 1 FROM public.sites s JOIN public.company_users cu ON cu.company_id=s.company_id
  WHERE s.id=tasks.site_id AND cu.user_id=(SELECT auth.uid())
    AND (tasks.company_id IS NULL OR tasks.company_id=s.company_id)
 ));

-- company_info lacks company_id: remove public read/write on shared row.
-- Its current editor is disabled; a company-owned replacement is needed later.
DROP POLICY IF EXISTS "Acces Total Public" ON public.company_info;

-- Create-company RPC must be regression-tested with RLS enabled.
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY bt_companies_member_select ON public.companies FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM public.company_users cu
  WHERE cu.company_id=companies.id AND cu.user_id=(SELECT auth.uid())));
CREATE POLICY bt_companies_admin_update ON public.companies FOR UPDATE TO authenticated
 USING (EXISTS(SELECT 1 FROM public.company_users cu
  WHERE cu.company_id=companies.id AND cu.user_id=(SELECT auth.uid()) AND cu.role='admin'))
 WITH CHECK (EXISTS(SELECT 1 FROM public.company_users cu
  WHERE cu.company_id=companies.id AND cu.user_id=(SELECT auth.uid()) AND cu.role='admin'));

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY bt_invites_admin_select ON public.invites FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM public.company_users cu
  WHERE cu.company_id=invites.company_id AND cu.user_id=(SELECT auth.uid()) AND cu.role='admin'));
CREATE POLICY bt_invites_admin_insert ON public.invites FOR INSERT TO authenticated
 WITH CHECK (EXISTS(SELECT 1 FROM public.company_users cu
  WHERE cu.company_id=invites.company_id AND cu.user_id=(SELECT auth.uid()) AND cu.role='admin'));
CREATE POLICY bt_invites_admin_update ON public.invites FOR UPDATE TO authenticated
 USING (EXISTS(SELECT 1 FROM public.company_users cu
  WHERE cu.company_id=invites.company_id AND cu.user_id=(SELECT auth.uid()) AND cu.role='admin'))
 WITH CHECK (EXISTS(SELECT 1 FROM public.company_users cu
  WHERE cu.company_id=invites.company_id AND cu.user_id=(SELECT auth.uid()) AND cu.role='admin'));
CREATE POLICY bt_invites_admin_delete ON public.invites FOR DELETE TO authenticated
 USING (EXISTS(SELECT 1 FROM public.company_users cu
  WHERE cu.company_id=invites.company_id AND cu.user_id=(SELECT auth.uid()) AND cu.role='admin'));

ALTER TABLE public.company_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY bt_modules_member_select ON public.company_modules FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM public.company_users cu
  WHERE cu.company_id=company_modules.company_id AND cu.user_id=(SELECT auth.uid())));
CREATE POLICY bt_modules_admin_manage ON public.company_modules FOR ALL TO authenticated
 USING (EXISTS(SELECT 1 FROM public.company_users cu
  WHERE cu.company_id=company_modules.company_id AND cu.user_id=(SELECT auth.uid()) AND cu.role='admin'))
 WITH CHECK (EXISTS(SELECT 1 FROM public.company_users cu
  WHERE cu.company_id=company_modules.company_id AND cu.user_id=(SELECT auth.uid()) AND cu.role='admin'));

-- Empty bookings table has no tenant_id. Deny browser operations until modeled.
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
COMMIT;
