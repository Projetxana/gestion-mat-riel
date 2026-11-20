-- Keep old performance reports unchanged and mark missing task actuals NULL.
-- Every new validation snapshots the consumed hours per task, using the same
-- historical reconciliation mode as the cumulative site IPMO.
ALTER TABLE public.bt_performance_report_tasks
 ADD COLUMN IF NOT EXISTS historical_hours numeric,
 ADD COLUMN IF NOT EXISTS session_hours numeric,
 ADD COLUMN IF NOT EXISTS consumed_hours numeric,
 ADD COLUMN IF NOT EXISTS task_performance_index numeric;

ALTER TABLE public.bt_performance_reports
 ADD COLUMN IF NOT EXISTS unassigned_session_hours numeric;

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
  v_task_sessions numeric;
  v_task_history numeric;
  v_task_actual numeric;
  v_task_index numeric;
  v_unassigned_sessions numeric := 0;
  v_unassigned_history numeric := 0;
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
  -- A completed task must not receive a final index if completed hours
  -- exist outside budgeted tasks. All amounts are frozen at validation.
  SELECT coalesce(sum(greatest(
    extract(epoch FROM (
      coalesce(ts.corrected_end_at,ts.punch_end_at) -
      coalesce(ts.corrected_start_at,ts.punch_start_at)
    )) / 3600, 0)),0)
  INTO v_unassigned_sessions
  FROM public.time_sessions ts
  WHERE ts.site_id=p_site_id AND ts.company_id=v_site.company_id
    AND ts.punch_end_at IS NOT NULL
    AND coalesce(ts.corrected_end_at,ts.punch_end_at) <= now()
    AND NOT EXISTS (
      SELECT 1 FROM public.project_tasks pt
      WHERE pt.project_id=p_site_id AND pt.id=ts.section_id
        AND pt.planned_hours > 0
    );

  SELECT coalesce(sum(greatest(coalesce(completed_hours,0),0)),0)
  INTO v_unassigned_history
  FROM public.project_tasks
  WHERE project_id=p_site_id AND coalesce(planned_hours,0) <= 0;

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
    physical_percent, performance_index, unassigned_session_hours
  ) VALUES (
    v_site.company_id, p_site_id, (SELECT auth.uid()), p_history_mode,
    v_budget, round(v_earned, 2), round(v_history, 2),
    round(v_sessions, 2), round(v_consumed, 2),
    round(v_earned / nullif(v_budget,0) * 100, 2), v_index,
    round(v_unassigned_sessions, 2)
  ) RETURNING id INTO v_report_id;

  FOR v_task IN
    SELECT id, name, planned_hours, completed_hours FROM public.project_tasks
    WHERE project_id=p_site_id AND planned_hours > 0 ORDER BY id
  LOOP
    SELECT item INTO v_entry
    FROM jsonb_array_elements(p_progress) AS data(item)
    WHERE item->>'task_id' = v_task.id::text;
    v_percent := (v_entry->>'percent')::numeric;

    v_task_history := greatest(coalesce(v_task.completed_hours,0),0);
    SELECT coalesce(sum(greatest(
      extract(epoch FROM (
        coalesce(ts.corrected_end_at,ts.punch_end_at) -
        coalesce(ts.corrected_start_at,ts.punch_start_at)
      )) / 3600, 0)),0)
    INTO v_task_sessions
    FROM public.time_sessions ts
    WHERE ts.site_id=p_site_id AND ts.company_id=v_site.company_id
      AND ts.section_id=v_task.id
      AND ts.punch_end_at IS NOT NULL
      AND coalesce(ts.corrected_end_at,ts.punch_end_at) <= now();

    v_task_actual := CASE
      WHEN v_history = 0 OR p_history_mode='sessions_only'
        THEN v_task_sessions
      WHEN p_history_mode='additive'
        THEN v_task_history + v_task_sessions
      ELSE NULL
    END;

    -- Only a VALIDATED 100% task can show its completion IPMO.
    -- Unknown historical overlaps, unassigned hours, or a budget mismatch
    -- suspend it. A zero-consumption task must not get an infinite index.
    v_task_index := CASE
      WHEN v_percent = 100 AND v_task_actual > 0
        AND v_index IS NOT NULL
        AND v_unassigned_sessions < 0.01
        AND (v_history = 0 OR p_history_mode = 'sessions_only'
          OR v_unassigned_history < 0.01)
      THEN round(v_task.planned_hours / v_task_actual, 3)
      ELSE NULL
    END;

    INSERT INTO public.bt_performance_report_tasks (
      report_id, task_id, task_name, planned_hours, physical_percent,
      earned_hours, historical_hours, session_hours, consumed_hours,
      task_performance_index
    ) VALUES (
      v_report_id, v_task.id, v_task.name, v_task.planned_hours,
      v_percent, round(v_task.planned_hours*v_percent/100,2),
      round(v_task_history,2), round(v_task_sessions,2),
      round(v_task_actual,2), v_task_index
    );
  END LOOP;
  RETURN jsonb_build_object(
    'report_id', v_report_id, 'physical_percent', round(v_earned/v_budget*100,2),
    'performance_index', v_index
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.bt_publish_performance_report(bigint,jsonb,text) FROM PUBLIC;

