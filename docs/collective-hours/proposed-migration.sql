-- PROPOSITION UNIQUEMENT. Vérifier schema-inspection.sql avant application.
-- Identifiants comparés en texte pour supporter les variantes BIGINT/UUID.
-- Ne modifie aucune table, donnée ou politique existante.
BEGIN;
CREATE OR REPLACE FUNCTION public.collective_hours_progress(requested_company text)
RETURNS TABLE(kind text, site_id text, section_id text, name text, site_name text, budget_hours numeric, consumed_hours numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.company_users m
    WHERE m.user_id::text = auth.uid()::text
      AND m.company_id::text = requested_company AND m.role IN ('admin', 'user', 'leader')
  ) THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH allowed_sites AS (
    -- Modèle du dépôt : tous les chantiers de l'entreprise sont autorisés.
    -- Si la production utilise des affectations, ajouter leur contrôle ici.
    SELECT s.* FROM public.sites s WHERE s.company_id::text = requested_company
  ), finished AS (
    SELECT t.site_id::text AS sid, t.section_id::text AS tid,
      CASE WHEN (to_jsonb(t)->>'duration_hours')::numeric > 0
        THEN (to_jsonb(t)->>'duration_hours')::numeric
        ELSE EXTRACT(epoch FROM (COALESCE(t.corrected_end_at,t.punch_end_at) - COALESCE(t.corrected_start_at,t.punch_start_at))) / 3600
      END AS hours
    FROM public.time_sessions t
    JOIN allowed_sites s ON s.id = t.site_id
    JOIN public.users u ON u.id::text = t.user_id::text AND u.company_id::text = requested_company
    WHERE t.company_id::text = requested_company
      AND t.punch_end_at IS NOT NULL
      AND COALESCE(t.corrected_end_at,t.punch_end_at) >= COALESCE(t.corrected_start_at,t.punch_start_at)
  )
  SELECT 'site'::text, s.id::text, NULL::text, s.name::text, s.name::text,
    s.planned_hours::numeric, SUM(f.hours)::numeric
    FROM allowed_sites s JOIN finished f ON f.sid = s.id::text
    GROUP BY s.id, s.name, s.planned_hours
  UNION ALL
  SELECT 'task'::text, s.id::text, p.id::text, p.name::text, s.name::text,
    p.planned_hours::numeric, SUM(f.hours)::numeric
    FROM allowed_sites s JOIN public.project_tasks p ON p.project_id = s.id AND p.company_id::text = requested_company
    JOIN finished f ON f.sid = s.id::text AND f.tid = p.id::text
    GROUP BY s.id, s.name, p.id, p.name, p.planned_hours;
END;
$$;
REVOKE ALL ON FUNCTION public.collective_hours_progress(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.collective_hours_progress(text) TO authenticated;
COMMIT;
