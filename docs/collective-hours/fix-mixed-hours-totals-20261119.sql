-- BuildTrack PR #6 — migration candidate: À APPLIQUER UNIQUEMENT APRÈS VALIDATION.
-- Schéma vérifié le 17 novembre 2026: sites.id/project_tasks.id BIGINT,
-- company_users.company_id UUID, time_sessions.user_id TEXT contient auth UUID.
-- Cette migration ne modifie NI table, NI ligne, NI politique RLS.
-- Employés : chantiers ayant une session terminée ; admins : tous ceux de leur entreprise.
-- Important: le rapport compte des heures BRUTES de sessions terminées.
-- Pas de déduction de pauses, pas de condition approved, ni de calcul de paie.
-- Les project_tasks.completed_hours sont des heures historiques saisies manuellement,
-- indépendantes des sessions de pointage : elles s'ajoutent aux sessions terminées.
-- IMPORTANT : si des pointages ont aussi été reportés manuellement dans completed_hours,
-- une réconciliation métier sera requise pour éviter tout doublon.
BEGIN;

CREATE OR REPLACE FUNCTION public.collective_hours_progress(requested_company text)
RETURNS TABLE (
  kind text,
  site_id text,
  section_id text,
  name text,
  site_name text,
  budget_hours numeric,
  consumed_hours numeric,
  last_worked_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  is_admin boolean := false;
BEGIN
  -- Autorisation côté serveur. Le company_id transmis par le client
  -- ne suffit jamais pour accéder à une autre entreprise.
  IF (SELECT auth.uid()) IS NULL OR NOT EXISTS (
    SELECT 1
      FROM public.company_users AS membership
     WHERE membership.user_id = (SELECT auth.uid())
       AND membership.company_id::text = requested_company
       AND membership.role IN ('admin', 'member')
  ) THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.company_users AS membership
    WHERE membership.user_id = (SELECT auth.uid())
      AND membership.company_id::text = requested_company
      AND membership.role = 'admin'
  ) INTO is_admin;

  RETURN QUERY
  WITH completed AS (
    SELECT t.site_id,
           t.section_id,
           t.user_id,
           COALESCE(t.corrected_end_at, t.punch_end_at) AS effective_end_at,
           EXTRACT(EPOCH FROM (
             COALESCE(t.corrected_end_at, t.punch_end_at) -
             COALESCE(t.corrected_start_at, t.punch_start_at)
           ))::numeric / 3600 AS total_hours
      FROM public.time_sessions AS t
      JOIN public.sites AS site
        ON site.id = t.site_id
       AND site.company_id = t.company_id
     WHERE t.company_id::text = requested_company
       AND t.punch_end_at IS NOT NULL
       AND t.punch_start_at IS NOT NULL
       AND COALESCE(t.corrected_end_at, t.punch_end_at) >=
           COALESCE(t.corrected_start_at, t.punch_start_at)
  ),
  worked_sites AS (
    SELECT c.site_id, MAX(c.effective_end_at) AS last_worked_at
      FROM completed AS c
     WHERE c.user_id = (SELECT auth.uid())::text
     GROUP BY c.site_id
  ),
  allowed_sites AS (
    SELECT s.id, s.name, s.planned_hours, w.last_worked_at
      FROM public.sites AS s
      LEFT JOIN worked_sites AS w ON w.site_id = s.id
     WHERE s.company_id::text = requested_company
       AND (is_admin OR w.site_id IS NOT NULL)
  )
  -- Employés : uniquement les chantiers de leurs sessions terminées.
  -- Admins : tous les chantiers de leur entreprise, même sans pointage.
  SELECT 'site'::text, s.id::text, NULL::text,
         s.name::text, s.name::text, s.planned_hours,
         (COALESCE(SUM(c.total_hours), 0) +
          COALESCE((SELECT SUM(GREATEST(COALESCE(h.completed_hours,0),0))
                      FROM public.project_tasks AS h
                     WHERE h.project_id = s.id),0))::numeric,
         s.last_worked_at
    FROM allowed_sites AS s
    LEFT JOIN completed AS c ON c.site_id = s.id
   GROUP BY s.id, s.name, s.planned_hours, s.last_worked_at

  UNION ALL

  -- Toutes les tâches de ces chantiers, y compris 0 heure.
  -- L'appartenance est déduite de project_tasks.project_id :
  -- project_tasks.company_id N'EXISTE PAS dans la vraie base.
  SELECT 'task'::text, s.id::text, p.id::text,
         p.name::text, s.name::text, p.planned_hours,
         (COALESCE(SUM(c.total_hours), 0) + GREATEST(COALESCE(p.completed_hours,0),0))::numeric,
         s.last_worked_at
    FROM allowed_sites AS s
    JOIN public.project_tasks AS p ON p.project_id = s.id
    LEFT JOIN completed AS c
      ON c.site_id = s.id AND c.section_id = p.id
   GROUP BY s.id, s.name, p.id, p.name, p.planned_hours, s.last_worked_at, p.completed_hours;
END;
$function$;

-- Une fonction SECURITY DEFINER est privilégiée : son accès doit rester limité.
REVOKE ALL ON FUNCTION public.collective_hours_progress(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.collective_hours_progress(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.collective_hours_progress(text) TO authenticated;
COMMIT;
