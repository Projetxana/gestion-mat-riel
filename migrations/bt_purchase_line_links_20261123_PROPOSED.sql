-- BuildTrack: explicit purchase order-line reconciliation, NO financial data changes.
-- Additive migration after MVP1. One order line may link to one estimate line
-- or be declared outside the estimate; multiple order lines may share a budget line.
BEGIN;

CREATE TABLE IF NOT EXISTS public.bt_purchase_line_links (
  order_line_id bigint PRIMARY KEY REFERENCES public.bt_purchase_order_lines(id) ON DELETE RESTRICT,
  budget_line_id bigint REFERENCES public.bt_purchase_budget_lines(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  site_id bigint NOT NULL REFERENCES public.sites(id) ON DELETE RESTRICT,
  disposition text NOT NULL CHECK(disposition IN ('linked','outside_budget')),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bt_purchase_line_links_target CHECK(
     (disposition='linked' AND budget_line_id IS NOT NULL) OR
     (disposition='outside_budget' AND budget_line_id IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS bt_purchase_line_links_site ON public.bt_purchase_line_links(company_id,site_id);

-- Canonical unit keys are deliberately narrow; unlike descriptions, quantities
-- cannot be linked across incompatible units without a conversion factor.
CREATE OR REPLACE FUNCTION public.bt_purchase_unit_key(p_unit text)
RETURNS text
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=''
AS $unit$
 SELECT CASE
  WHEN upper(regexp_replace(coalesce(p_unit,''),'[^A-Za-z0-9]','','g'))
    IN ('PI','FT','PIED','PIEDS','FEET','FOOT') THEN 'PI'
  WHEN upper(regexp_replace(coalesce(p_unit,''),'[^A-Za-z0-9]','','g'))
    IN ('UN','EA','EACH','PCS','PC','UNIT') THEN 'UN'
  ELSE upper(regexp_replace(coalesce(p_unit,''),'[^A-Za-z0-9]','','g'))
 END
$unit$;

ALTER TABLE public.bt_purchase_line_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY bt_purchase_line_links_admin_read ON public.bt_purchase_line_links
 FOR SELECT TO authenticated
 USING(public.bt_stage2_is_admin(company_id));

-- RLS protects against forged company/project IDs, including when writes
-- bypass the app's UI. This table cannot change any purchase line or price.
CREATE POLICY bt_purchase_line_links_admin_insert ON public.bt_purchase_line_links
 FOR INSERT TO authenticated WITH CHECK(
  public.bt_stage2_is_admin(company_id)
  AND created_by=(SELECT auth.uid())
  AND EXISTS(
   SELECT 1 FROM public.bt_purchase_order_lines o
    WHERE o.id=bt_purchase_line_links.order_line_id
      AND o.company_id=bt_purchase_line_links.company_id
      AND o.site_id=bt_purchase_line_links.site_id
  )
  AND (
   disposition='outside_budget' OR EXISTS(
    SELECT 1 FROM public.bt_purchase_budget_lines b
    JOIN public.bt_purchase_order_lines o ON o.id=bt_purchase_line_links.order_line_id
    WHERE b.id=bt_purchase_line_links.budget_line_id
      AND b.company_id=bt_purchase_line_links.company_id
      AND b.site_id=bt_purchase_line_links.site_id
      AND public.bt_purchase_unit_key(b.unit)=public.bt_purchase_unit_key(o.unit)
   )
  )
 );
CREATE POLICY bt_purchase_line_links_admin_update ON public.bt_purchase_line_links
 FOR UPDATE TO authenticated
 USING(public.bt_stage2_is_admin(company_id))
 WITH CHECK(
   public.bt_stage2_is_admin(company_id)
   AND created_by=(SELECT auth.uid())
   AND EXISTS(
     SELECT 1 FROM public.bt_purchase_order_lines o
     WHERE o.id=bt_purchase_line_links.order_line_id
       AND o.company_id=bt_purchase_line_links.company_id
       AND o.site_id=bt_purchase_line_links.site_id
   )
   AND (
     disposition='outside_budget' OR EXISTS(
       SELECT 1 FROM public.bt_purchase_budget_lines b
       JOIN public.bt_purchase_order_lines o ON o.id=bt_purchase_line_links.order_line_id
       WHERE b.id=bt_purchase_line_links.budget_line_id
         AND b.company_id=bt_purchase_line_links.company_id
         AND b.site_id=bt_purchase_line_links.site_id
         AND public.bt_purchase_unit_key(b.unit)=public.bt_purchase_unit_key(o.unit)
     )
   )
 );
CREATE POLICY bt_purchase_line_links_admin_delete ON public.bt_purchase_line_links
 FOR DELETE TO authenticated USING(public.bt_stage2_is_admin(company_id));

REVOKE ALL ON public.bt_purchase_line_links FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.bt_purchase_line_links TO authenticated;
REVOKE ALL ON FUNCTION public.bt_purchase_unit_key(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bt_purchase_unit_key(text) TO authenticated;

COMMIT;
