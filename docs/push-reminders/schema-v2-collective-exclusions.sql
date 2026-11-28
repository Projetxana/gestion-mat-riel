BEGIN;
ALTER TABLE public.bt_push_settings ADD COLUMN daily_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.bt_push_settings DROP CONSTRAINT bt_push_settings_check;
ALTER TABLE public.bt_push_settings ADD CONSTRAINT bt_push_settings_schedule_check CHECK (NOT (daily_enabled AND weekly_enabled) OR weekly_minute >= daily_minute + 30);
CREATE TABLE public.bt_push_exclusions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 start_date date NOT NULL, end_date date NOT NULL,
 label text NOT NULL DEFAULT '' CHECK (length(label)<=120),
 CHECK (end_date >= start_date),
 UNIQUE(company_id,start_date,end_date)
);
ALTER TABLE public.bt_push_exclusions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bt_push_exclusions FROM PUBLIC,anon,authenticated;
GRANT SELECT,DELETE ON public.bt_push_exclusions TO authenticated;
GRANT INSERT(company_id,start_date,end_date,label) ON public.bt_push_exclusions TO authenticated;
GRANT SELECT ON public.bt_push_exclusions TO service_role;
CREATE POLICY bt_push_exclusions_admin ON public.bt_push_exclusions FOR ALL TO authenticated
 USING(public.bt_stage2_is_admin(company_id)) WITH CHECK(public.bt_stage2_is_admin(company_id));
CREATE OR REPLACE FUNCTION public.bt_push_due(p_now timestamptz DEFAULT now())
RETURNS TABLE(subscription_id uuid,company_id uuid,user_id uuid,kind text,reminder_date date)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $fn$
 WITH local AS (
   SELECT cfg.*, (p_now AT TIME ZONE cfg.timezone)::date AS today,
      (extract(hour FROM p_now AT TIME ZONE cfg.timezone)::int*60+
       extract(minute FROM p_now AT TIME ZONE cfg.timezone)::int) AS minute,
      extract(isodow FROM p_now AT TIME ZONE cfg.timezone)::int AS dow
   FROM public.bt_push_settings cfg WHERE cfg.enabled
 ), eligible AS (
   SELECT l.*, s.user_id,s.created_at AS enrolled_at,s.id AS sub_id
   FROM local l JOIN public.bt_push_subscriptions s ON s.company_id=l.company_id
   WHERE l.dow BETWEEN 1 AND 5 AND s.created_at <= p_now
     AND EXISTS(SELECT 1 FROM public.company_users m WHERE m.company_id=s.company_id
       AND m.user_id=s.user_id AND m.role='member')
 ), due AS (
   SELECT e.*, 'daily'::text AS reminder_kind,e.today AS first_day
   FROM eligible e WHERE e.daily_enabled AND e.minute>=e.daily_minute AND e.minute<e.daily_minute+30
   UNION ALL
   SELECT e.*, 'weekly'::text AS reminder_kind,e.today-4 AS first_day
   FROM eligible e WHERE e.dow=5 AND e.weekly_enabled AND
       e.minute>=e.weekly_minute AND e.minute<e.weekly_minute+30
 )
 SELECT d.sub_id,d.company_id,d.user_id,d.reminder_kind,d.today
 FROM due d
 WHERE NOT EXISTS (SELECT 1 FROM public.bt_push_exclusions x WHERE x.company_id=d.company_id AND d.today BETWEEN x.start_date AND x.end_date)
 AND EXISTS (
   SELECT 1 FROM generate_series(0,d.today-d.first_day) AS day_offset(n)
   CROSS JOIN LATERAL (SELECT d.first_day+day_offset.n AS work_date) w
   WHERE w.work_date >= (d.enrolled_at AT TIME ZONE d.timezone)::date
   AND NOT EXISTS(SELECT 1 FROM public.bt_push_exclusions a
       WHERE a.company_id=d.company_id AND w.work_date BETWEEN a.start_date AND a.end_date)
   AND NOT EXISTS (
     SELECT 1 FROM public.time_sessions ts
     WHERE ts.company_id=d.company_id AND ts.user_id=d.user_id::text
       AND coalesce(ts.corrected_start_at,ts.punch_start_at)<((w.work_date+1)::timestamp AT TIME ZONE d.timezone)
       AND (
         (ts.punch_end_at IS NULL AND coalesce(ts.corrected_start_at,ts.punch_start_at)>=(w.work_date::timestamp AT TIME ZONE d.timezone))
         OR (ts.punch_end_at IS NOT NULL
           AND coalesce(ts.corrected_end_at,ts.punch_end_at)>coalesce(ts.corrected_start_at,ts.punch_start_at)
           AND coalesce(ts.corrected_end_at,ts.punch_end_at)>(w.work_date::timestamp AT TIME ZONE d.timezone))
       )
   )
 )
 AND NOT EXISTS(SELECT 1 FROM public.bt_push_history h WHERE h.subscription_id=d.sub_id
       AND h.kind=d.reminder_kind AND h.reminder_date=d.today)
 ORDER BY d.sub_id,d.reminder_kind;
$fn$;


REVOKE ALL ON FUNCTION public.bt_push_due(timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bt_push_due(timestamptz) TO service_role;
COMMIT;
