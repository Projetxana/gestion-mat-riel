-- BuildTrack Web Push: proposed migration. Apply to isolated staging first.
BEGIN;
CREATE TABLE public.bt_push_settings (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  daily_minute integer NOT NULL DEFAULT 1080 CHECK (daily_minute BETWEEN 0 AND 1410),
  weekly_enabled boolean NOT NULL DEFAULT true,
  weekly_minute integer NOT NULL DEFAULT 1140 CHECK (weekly_minute BETWEEN 0 AND 1410),
  timezone text NOT NULL DEFAULT 'America/Toronto'
    CHECK (timezone IN ('America/Toronto','America/Halifax','America/St_Johns','America/Winnipeg','America/Regina','America/Edmonton','America/Vancouver')),
  CHECK (NOT weekly_enabled OR weekly_minute >= daily_minute + 30)
);
CREATE TABLE public.bt_push_roster (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(company_id,user_id)
);
CREATE TABLE public.bt_push_absences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  start_date date NOT NULL, end_date date NOT NULL,
  CHECK (end_date >= start_date)
);
CREATE INDEX bt_push_absences_member_dates ON public.bt_push_absences(company_id,user_id,start_date,end_date);
CREATE TABLE public.bt_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(endpoint) BETWEEN 30 AND 2048 AND endpoint !~ '[[:space:][:cntrl:]]'
    AND endpoint ~ '^https://(([a-z0-9-]+\.)*push\.apple\.com|fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)+notify\.windows\.com)/')
);
CREATE INDEX bt_push_subscriptions_member ON public.bt_push_subscriptions(company_id,user_id);
CREATE TABLE public.bt_push_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN ('daily','weekly')),
  reminder_date date NOT NULL,
  status text NOT NULL DEFAULT 'claimed' CHECK(status IN ('claimed','accepted','failed','expired','skipped')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(subscription_id,kind,reminder_date)
);
CREATE INDEX bt_push_history_company ON public.bt_push_history(company_id,created_at DESC);

ALTER TABLE public.bt_push_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bt_push_roster ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bt_push_absences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bt_push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bt_push_history ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.bt_push_settings, public.bt_push_roster, public.bt_push_absences,
  public.bt_push_subscriptions, public.bt_push_history FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE ON public.bt_push_settings TO authenticated;
GRANT SELECT,DELETE ON public.bt_push_roster, public.bt_push_absences TO authenticated;
GRANT INSERT(company_id,user_id) ON public.bt_push_roster TO authenticated;
GRANT INSERT(company_id,user_id,start_date,end_date) ON public.bt_push_absences TO authenticated;
GRANT SELECT,DELETE ON public.bt_push_subscriptions TO authenticated;
GRANT INSERT(company_id,user_id,endpoint), UPDATE(company_id,user_id,endpoint) ON public.bt_push_subscriptions TO authenticated;
GRANT SELECT ON public.bt_push_history TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.bt_push_settings, public.bt_push_roster, public.bt_push_absences,
  public.bt_push_subscriptions, public.bt_push_history TO service_role;

CREATE POLICY bt_push_settings_admin ON public.bt_push_settings FOR ALL TO authenticated
 USING (public.bt_stage2_is_admin(company_id)) WITH CHECK(public.bt_stage2_is_admin(company_id));
CREATE POLICY bt_push_roster_admin ON public.bt_push_roster FOR ALL TO authenticated
 USING(public.bt_stage2_is_admin(company_id))
 WITH CHECK(public.bt_stage2_is_admin(company_id) AND EXISTS (
   SELECT 1 FROM public.company_users m WHERE m.company_id=bt_push_roster.company_id
     AND m.user_id=bt_push_roster.user_id AND m.role='member'));
CREATE POLICY bt_push_absences_admin ON public.bt_push_absences FOR ALL TO authenticated
 USING(public.bt_stage2_is_admin(company_id))
 WITH CHECK(public.bt_stage2_is_admin(company_id) AND EXISTS (
   SELECT 1 FROM public.company_users m WHERE m.company_id=bt_push_absences.company_id
     AND m.user_id=bt_push_absences.user_id AND m.role='member'));
-- Device endpoints are sensitive capability URLs. Even administrators do not see other users' endpoints.
CREATE POLICY bt_push_subscription_self_read ON public.bt_push_subscriptions FOR SELECT TO authenticated
 USING(user_id=(SELECT auth.uid()) AND public.bt_stage2_is_member(company_id));
CREATE POLICY bt_push_subscription_self_insert ON public.bt_push_subscriptions FOR INSERT TO authenticated
 WITH CHECK(user_id=(SELECT auth.uid()) AND public.bt_stage2_is_member(company_id));
CREATE POLICY bt_push_subscription_self_update ON public.bt_push_subscriptions FOR UPDATE TO authenticated
 USING(user_id=(SELECT auth.uid()) AND public.bt_stage2_is_member(company_id))
 WITH CHECK(user_id=(SELECT auth.uid()) AND public.bt_stage2_is_member(company_id));
CREATE POLICY bt_push_subscription_self_delete ON public.bt_push_subscriptions FOR DELETE TO authenticated
 USING(user_id=(SELECT auth.uid()) AND public.bt_stage2_is_member(company_id));
CREATE POLICY bt_push_history_admin ON public.bt_push_history FOR SELECT TO authenticated
 USING(public.bt_stage2_is_admin(company_id));

-- Private scheduler API (service role only). Local date/time handles DST automatically.
-- Existing time sessions use actual/corrected timestamps; a positive completed session
-- or a punch still open that day suppresses the reminder (not a payroll calculation).
CREATE FUNCTION public.bt_push_due(p_now timestamptz DEFAULT now())
RETURNS TABLE(subscription_id uuid,company_id uuid,user_id uuid,kind text,reminder_date date)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $fn$
 WITH local AS (
   SELECT cfg.*, (p_now AT TIME ZONE cfg.timezone)::date AS today,
      (extract(hour FROM p_now AT TIME ZONE cfg.timezone)::int*60+
       extract(minute FROM p_now AT TIME ZONE cfg.timezone)::int) AS minute,
      extract(isodow FROM p_now AT TIME ZONE cfg.timezone)::int AS dow
   FROM public.bt_push_settings cfg WHERE cfg.enabled
 ), eligible AS (
   SELECT l.*, r.user_id,r.enrolled_at,s.id AS sub_id
   FROM local l JOIN public.bt_push_roster r ON r.company_id=l.company_id
   JOIN public.bt_push_subscriptions s ON s.company_id=l.company_id AND s.user_id=r.user_id
   WHERE l.dow BETWEEN 1 AND 5 AND r.enrolled_at <= p_now
     AND EXISTS(SELECT 1 FROM public.company_users m WHERE m.company_id=r.company_id
       AND m.user_id=r.user_id AND m.role='member')
 ), due AS (
   SELECT e.*, 'daily'::text AS reminder_kind,e.today AS first_day
   FROM eligible e WHERE e.minute>=e.daily_minute AND e.minute<e.daily_minute+30
   UNION ALL
   SELECT e.*, 'weekly'::text AS reminder_kind,e.today-4 AS first_day
   FROM eligible e WHERE e.dow=5 AND e.weekly_enabled AND
       e.minute>=e.weekly_minute AND e.minute<e.weekly_minute+30
 )
 SELECT d.sub_id,d.company_id,d.user_id,d.reminder_kind,d.today
 FROM due d
 WHERE EXISTS (
   SELECT 1 FROM generate_series(0,d.today-d.first_day) AS day_offset(n)
   CROSS JOIN LATERAL (SELECT d.first_day+day_offset.n AS work_date) w
   WHERE w.work_date >= (d.enrolled_at AT TIME ZONE d.timezone)::date
   AND NOT EXISTS(SELECT 1 FROM public.bt_push_absences a
       WHERE a.company_id=d.company_id AND a.user_id=d.user_id AND w.work_date BETWEEN a.start_date AND a.end_date)
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

CREATE FUNCTION public.bt_push_claim(p_subscription_id uuid,p_kind text,p_day date,p_now timestamptz DEFAULT now())
RETURNS TABLE(history_id uuid,endpoint text,subscription_id uuid)
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
 WITH claimed AS (
  INSERT INTO public.bt_push_history(company_id,user_id,subscription_id,kind,reminder_date)
    SELECT d.company_id,d.user_id,d.subscription_id,d.kind,d.reminder_date
    FROM public.bt_push_due(p_now) d WHERE d.subscription_id=p_subscription_id AND d.kind=p_kind AND d.reminder_date=p_day
    ON CONFLICT(subscription_id,kind,reminder_date) DO NOTHING
    RETURNING id,bt_push_history.subscription_id
 )
 SELECT c.id,s.endpoint,c.subscription_id FROM claimed c
 JOIN public.bt_push_subscriptions s ON s.id=c.subscription_id;
$fn$;
CREATE FUNCTION public.bt_push_prune()
RETURNS void LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
 DELETE FROM public.bt_push_history WHERE created_at < now()-interval '90 days';
$fn$;
REVOKE ALL ON FUNCTION public.bt_push_due(timestamptz),public.bt_push_claim(uuid,text,date,timestamptz),
 public.bt_push_prune() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bt_push_due(timestamptz),public.bt_push_claim(uuid,text,date,timestamptz),
 public.bt_push_prune() TO service_role;
COMMIT;
