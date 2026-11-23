-- BuildTrack: distinguish pre-app manual hours from employee punches.
-- Separate from IPMO history_mode and performance reports; no task/hour mutation.
BEGIN;

CREATE TABLE IF NOT EXISTS public.bt_site_manual_hour_policies(
  site_id bigint PRIMARY KEY REFERENCES public.sites(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  manual_hours_distinct boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL REFERENCES auth.users(id)
);

ALTER TABLE public.bt_site_manual_hour_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY bt_site_manual_hours_admin_select ON public.bt_site_manual_hour_policies
 FOR SELECT TO authenticated
 USING (
   public.bt_stage2_is_admin(company_id)
   AND EXISTS (
     SELECT 1 FROM public.sites s WHERE s.id=site_id
       AND s.company_id=bt_site_manual_hour_policies.company_id
   )
 );

CREATE POLICY bt_site_manual_hours_admin_insert ON public.bt_site_manual_hour_policies
 FOR INSERT TO authenticated WITH CHECK (
   public.bt_stage2_is_admin(company_id)
   AND updated_by=(SELECT auth.uid())
   AND EXISTS (
     SELECT 1 FROM public.sites s WHERE s.id=site_id
       AND s.company_id=bt_site_manual_hour_policies.company_id
   )
 );

CREATE POLICY bt_site_manual_hours_admin_update ON public.bt_site_manual_hour_policies
 FOR UPDATE TO authenticated
 USING(public.bt_stage2_is_admin(company_id))
 WITH CHECK (
   public.bt_stage2_is_admin(company_id)
   AND updated_by=(SELECT auth.uid())
   AND EXISTS (
     SELECT 1 FROM public.sites s WHERE s.id=site_id
       AND s.company_id=bt_site_manual_hour_policies.company_id
   )
 );

REVOKE ALL ON public.bt_site_manual_hour_policies FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE ON public.bt_site_manual_hour_policies TO authenticated;
COMMIT;
