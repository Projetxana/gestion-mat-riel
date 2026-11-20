
-- Grouped weekly hours review, strictly scoped to a single company.
-- Effective time (corrected if set) determines the week, consistent with reports.
-- All approvals happen in one RPC transaction; if anything fails, nothing is approved.

CREATE OR REPLACE FUNCTION public.bt_review_week_sessions(
    p_company_id uuid,
    p_week_start timestamptz,
    p_week_end timestamptz
)
RETURNS SETOF public.time_sessions
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = ''
AS $function$
    SELECT s.*
    FROM public.time_sessions AS s
    WHERE public.bt_stage2_is_admin(p_company_id)
      AND s.company_id = p_company_id
      AND s.punch_end_at IS NOT NULL
      AND coalesce(s.corrected_start_at, s.punch_start_at) >= p_week_start
      AND coalesce(s.corrected_start_at, s.punch_start_at) < p_week_end
      AND p_week_start < p_week_end
      AND p_week_end <= p_week_start + interval '8 days'
    ORDER BY coalesce(s.corrected_start_at, s.punch_start_at) DESC, s.id DESC;
$function$;

CREATE OR REPLACE FUNCTION public.bt_approve_employee_week(
    p_company_id uuid,
    p_employee_id text,
    p_week_start timestamptz,
    p_week_end timestamptz,
    p_expected_ids bigint[]
)
RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    v_locked_ids bigint[];
    v_expected_ids bigint[];
    v_affected integer;
    v_invalid_count integer;
BEGIN
    IF (SELECT auth.uid()) IS NULL OR NOT public.bt_stage2_is_admin(p_company_id) THEN
        RAISE EXCEPTION 'Validation réservée aux administrateurs de cette entreprise.'
            USING ERRCODE = '42501';
    END IF;
    IF p_company_id IS NULL OR p_employee_id IS NULL OR length(btrim(p_employee_id)) = 0
        OR p_week_start IS NULL OR p_week_end IS NULL
        OR p_week_end <= p_week_start
        OR p_week_end > p_week_start + interval '8 days' THEN
        RAISE EXCEPTION 'Période ou employé invalide.' USING ERRCODE = '22023';
    END IF;

    SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}'::bigint[])
    INTO v_expected_ids
    FROM unnest(coalesce(p_expected_ids, '{}'::bigint[])) AS supplied(x);

    IF v_expected_ids IS NULL OR cardinality(v_expected_ids) = 0
       OR cardinality(v_expected_ids) <> cardinality(coalesce(p_expected_ids, '{}'::bigint[])) THEN
        RAISE EXCEPTION 'Aucune saisie à valider ou identifiants en double.'
            USING ERRCODE = '22023';
    END IF;

    -- Lock the current pending sessions, but never include another employee,
    -- another company, unfinished sessions, or dates outside the week.
    SELECT coalesce(array_agg(id ORDER BY id), '{}'::bigint[])
    INTO v_locked_ids
    FROM (
        SELECT s.id
        FROM public.time_sessions s
        WHERE s.company_id = p_company_id
          AND s.user_id = p_employee_id
          AND s.approved IS DISTINCT FROM TRUE
          AND s.punch_end_at IS NOT NULL
          AND coalesce(s.corrected_start_at, s.punch_start_at) >= p_week_start
          AND coalesce(s.corrected_start_at, s.punch_start_at) < p_week_end
        ORDER BY s.id
        FOR UPDATE
    ) locked;

    IF v_locked_ids <> v_expected_ids THEN
        RAISE EXCEPTION 'Les heures ont changé depuis l affichage. Actualisez avant de valider.'
            USING ERRCODE = '40001';
    END IF;

    SELECT count(*) INTO v_invalid_count
    FROM public.time_sessions s
    WHERE s.id = ANY(v_locked_ids)
      AND (
          s.site_id IS NULL
       OR s.section_id IS NULL
       OR coalesce(s.corrected_end_at, s.punch_end_at)
          <= coalesce(s.corrected_start_at, s.punch_start_at)
       OR coalesce(s.corrected_end_at, s.punch_end_at)
          > coalesce(s.corrected_start_at, s.punch_start_at) + interval '24 hours'
      );

    IF v_invalid_count > 0 THEN
        RAISE EXCEPTION 'Une saisie comporte un chantier, une tâche ou une durée invalide. Corrigez-la avant validation.'
            USING ERRCODE = '22023';
    END IF;

    -- Triggers automatically record the reviewer/timestamp and a per-row
    -- immutable audit event. The single SQL transaction is all-or-nothing.
    UPDATE public.time_sessions s
    SET approved = TRUE
    WHERE s.id = ANY(v_locked_ids)
      AND s.company_id = p_company_id
      AND s.user_id = p_employee_id
      AND s.approved IS DISTINCT FROM TRUE;

    GET DIAGNOSTICS v_affected = ROW_COUNT;
    IF v_affected <> cardinality(v_expected_ids) THEN
        RAISE EXCEPTION 'Validation incomplète. Aucun changement appliqué.'
            USING ERRCODE = '40001';
    END IF;
    RETURN v_affected;
END;
$function$;

REVOKE ALL ON FUNCTION public.bt_review_week_sessions(uuid,timestamptz,timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bt_approve_employee_week(uuid,text,timestamptz,timestamptz,bigint[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bt_review_week_sessions(uuid,timestamptz,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bt_approve_employee_week(uuid,text,timestamptz,timestamptz,bigint[]) TO authenticated;
