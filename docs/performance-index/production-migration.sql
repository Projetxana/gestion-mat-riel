-- BuildTrack: optional company-scoped productivity reporting.
-- Zero modifications to existing hours, sites or project_tasks.
-- Reports capture immutable cumulative earned/consumed hours at validation time.

CREATE TABLE IF NOT EXISTS public.bt_performance_settings (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  updated_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bt_performance_reports (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  site_id bigint NOT NULL REFERENCES public.sites(id) ON DELETE RESTRICT,
  validated_by uuid NOT NULL,
  validated_at timestamptz NOT NULL DEFAULT now(),
  history_mode text NOT NULL CHECK (history_mode IN ('unverified','additive','sessions_only')),
  planned_hours numeric NOT NULL,
  earned_hours numeric NOT NULL CHECK (earned_hours >= 0),
  historical_hours numeric NOT NULL,
  session_hours numeric NOT NULL,
  consumed_hours numeric,
  physical_percent numeric NOT NULL,
  performance_index numeric
);

CREATE INDEX IF NOT EXISTS bt_performance_reports_site_date_idx
ON public.bt_performance_reports(site_id, validated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS public.bt_performance_report_tasks (
  report_id bigint NOT NULL REFERENCES public.bt_performance_reports(id) ON DELETE CASCADE,
  task_id bigint REFERENCES public.project_tasks(id) ON DELETE SET NULL,
  task_name text NOT NULL,
  planned_hours numeric NOT NULL CHECK (planned_hours > 0),
  physical_percent numeric NOT NULL CHECK (physical_percent BETWEEN 0 AND 100),
  earned_hours numeric NOT NULL CHECK (earned_hours >= 0)
);

CREATE INDEX IF NOT EXISTS bt_performance_report_tasks_report_idx
ON public.bt_performance_report_tasks(report_id);

ALTER TABLE public.bt_performance_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bt_performance_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bt_performance_report_tasks ENABLE ROW LEVEL SECURITY;

-- Only the company's administrators manage the opt-in.
CREATE POLICY bt_performance_settings_select ON public.bt_performance_settings
FOR SELECT TO authenticated USING (public.bt_stage2_is_admin(company_id));
CREATE POLICY bt_performance_settings_insert ON public.bt_performance_settings
FOR INSERT TO authenticated WITH CHECK (
  public.bt_stage2_is_admin(company_id) AND updated_by = (SELECT auth.uid())
);
CREATE POLICY bt_performance_settings_update ON public.bt_performance_settings
FOR UPDATE TO authenticated USING (public.bt_stage2_is_admin(company_id))
WITH CHECK (public.bt_stage2_is_admin(company_id) AND updated_by = (SELECT auth.uid()));

-- Read-only reporting API for company administrators. Writes exclusively via
-- the transactional RPC below, which checks admin role + explicit opt-in.
CREATE POLICY bt_performance_reports_select ON public.bt_performance_reports
FOR SELECT TO authenticated USING (public.bt_stage2_is_admin(company_id));
CREATE POLICY bt_performance_report_tasks_select ON public.bt_performance_report_tasks
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.bt_performance_reports r
  WHERE r.id = report_id AND public.bt_stage2_is_admin(r.company_id)
));

REVOKE ALL ON public.bt_performance_settings FROM anon;
REVOKE ALL ON public.bt_performance_reports FROM anon;
REVOKE ALL ON public.bt_performance_report_tasks FROM anon;
REVOKE ALL ON public.bt_performance_reports FROM authenticated;
REVOKE ALL ON public.bt_performance_report_tasks FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.bt_performance_settings TO authenticated;
GRANT SELECT ON public.bt_performance_reports, public.bt_performance_report_tasks TO authenticated;

CREATE OR REPLACE FUNCTION public.bt_publish_performance_report(
  p_site_id bigint,
  p_progress jsonb,
  p_history_mode text DEFAULT 'unverified'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_site record;
  v_task record;
  v_entry jsonb;
  v_task_count integer;
  v_entry_count integer;
  v_distinct_count integer;
  v_budget numeric := 0;
  v_earned numeric := 0;
  v_history numeric := 0;
  v_sessions numeric := 0;
  v_consumed numeric;
  v_index numeric;
  v_report_id bigint;
  v_percent numeric;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentification requise.' USING ERRCODE='42501';
  END IF;
  SELECT id, company_id, planned_hours INTO v_site
  FROM public.sites WHERE id = p_site_id AND status IS DISTINCT FROM 'archived';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chantier actif introuvable.' USING ERRCODE='P0002';
  END IF;
  IF NOT public.bt_stage2_is_admin(v_site.company_id) THEN
    RAISE EXCEPTION 'Seul un administrateur de cette entreprise peut valider la performance.' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.bt_performance_settings
    WHERE company_id = v_site.company_id AND enabled IS TRUE
  ) THEN
    RAISE EXCEPTION 'Activez d abord le module dans les paramètres.' USING ERRCODE='42501';
  END IF;
  IF p_history_mode IS NULL OR p_history_mode NOT IN ('unverified','additive','sessions_only') THEN
    RAISE EXCEPTION 'Mode de rapprochement des heures invalide.' USING ERRCODE='22023';
  END IF;
  IF p_progress IS NULL OR jsonb_typeof(p_progress) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Les tâches doivent être fournies dans une liste.' USING ERRCODE='22023';
  END IF;

  SELECT count(*) INTO v_task_count
  FROM public.project_tasks
  WHERE project_id = p_site_id AND coalesce(planned_hours, 0) > 0;
  SELECT count(*), count(DISTINCT item->>'task_id')
    INTO v_entry_count, v_distinct_count
  FROM jsonb_array_elements(p_progress) AS data(item);
  IF v_task_count = 0 OR v_entry_count <> v_task_count OR v_distinct_count <> v_entry_count THEN
    RAISE EXCEPTION 'Validez une fois chacune des tâches avec budget positif.' USING ERRCODE='22023';
  END IF;

  -- Compute the earned-hour sum from server-owned task budgets; the browser
  -- supplies only percentages, never budget, actual hours, or earned hours.
  FOR v_task IN
    SELECT id, name, planned_hours FROM public.project_tasks
    WHERE project_id = p_site_id AND planned_hours > 0 ORDER BY id
  LOOP
    SELECT item INTO v_entry
    FROM jsonb_array_elements(p_progress) AS data(item)
    WHERE item->>'task_id' = v_task.id::text;
    IF v_entry IS NULL OR v_entry->>'percent' IS NULL THEN
      RAISE EXCEPTION 'Pourcentage manquant pour une tâche.' USING ERRCODE='22023';
    END IF;
    v_percent := (v_entry->>'percent')::numeric;
    IF v_percent < 0 OR v_percent > 100 THEN
      RAISE EXCEPTION 'Pourcentages entre 0 et 100 uniquement.' USING ERRCODE='22023';
    END IF;
    v_budget := v_budget + v_task.planned_hours;
    v_earned := v_earned + v_task.planned_hours * v_percent / 100;
  END LOOP;

  SELECT coalesce(sum(greatest(coalesce(completed_hours, 0), 0)), 0)
  INTO v_history FROM public.project_tasks WHERE project_id=p_site_id;

  SELECT coalesce(sum(greatest(
    extract(epoch FROM (
      coalesce(corrected_end_at, punch_end_at) -
      coalesce(corrected_start_at, punch_start_at)
    )) / 3600, 0)), 0)
  INTO v_sessions FROM public.time_sessions
  WHERE site_id=p_site_id AND company_id=v_site.company_id
    AND punch_end_at IS NOT NULL AND coalesce(corrected_end_at,punch_end_at) <= now();

  IF v_history = 0 OR p_history_mode = 'sessions_only' THEN
    v_consumed := v_sessions;
  ELSIF p_history_mode = 'additive' THEN
    v_consumed := v_history + v_sessions;
  ELSE
    v_consumed := NULL;
  END IF;
  -- Never publish an index when the site and task budgets differ:
  -- some work might be missing from the denominator.
  IF v_consumed > 0 AND (v_site.planned_hours IS NULL OR
    abs(v_site.planned_hours - v_budget) < 0.01) THEN
    v_index := round(v_earned / v_consumed, 3);
  ELSE
    v_index := NULL;
  END IF;

  INSERT INTO public.bt_performance_reports (
    company_id, site_id, validated_by, history_mode, planned_hours,
    earned_hours, historical_hours, session_hours, consumed_hours,
    physical_percent, performance_index
  ) VALUES (
    v_site.company_id, p_site_id, (SELECT auth.uid()), p_history_mode,
    v_budget, round(v_earned, 2), round(v_history, 2),
    round(v_sessions, 2), round(v_consumed, 2),
    round(v_earned / nullif(v_budget,0) * 100, 2), v_index
  ) RETURNING id INTO v_report_id;

  FOR v_task IN
    SELECT id, name, planned_hours FROM public.project_tasks
    WHERE project_id=p_site_id AND planned_hours > 0 ORDER BY id
  LOOP
    SELECT item INTO v_entry
    FROM jsonb_array_elements(p_progress) AS data(item)
    WHERE item->>'task_id' = v_task.id::text;
    v_percent := (v_entry->>'percent')::numeric;
    INSERT INTO public.bt_performance_report_tasks (
      report_id, task_id, task_name, planned_hours, physical_percent, earned_hours
    ) VALUES (
      v_report_id, v_task.id, v_task.name, v_task.planned_hours,
      v_percent, round(v_task.planned_hours*v_percent/100,2)
    );
  END LOOP;
  RETURN jsonb_build_object(
    'report_id', v_report_id, 'physical_percent', round(v_earned/v_budget*100,2),
    'performance_index', v_index
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.bt_publish_performance_report(bigint,jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bt_publish_performance_report(bigint,jsonb,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.bt_publish_performance_report(bigint,jsonb,text) TO authenticated;
