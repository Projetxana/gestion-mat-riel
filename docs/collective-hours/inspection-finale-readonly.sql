-- À EXÉCUTER UNIQUEMENT EN LECTURE SEULE dans Supabase BuildTrack.
-- Aucun enregistrement personnel n'est retourné.
-- 1. Vérifier RLS et les politiques en vigueur.
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS force_rls
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN
 ('time_sessions','sites','project_tasks','company_users','users')
ORDER BY c.relname;

SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN
 ('time_sessions','sites','project_tasks','company_users','users')
ORDER BY tablename, policyname;

-- 2. Fonctions privilégiées : uniquement définitions des fonctions liées aux heures.
SELECT p.proname AS function_name, pg_get_function_identity_arguments(p.oid) AS signature,
       p.prosecdef AS security_definer, pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (p.proname LIKE 'bt_stage2_%' OR p.proname LIKE '%time_session%' OR p.proname LIKE '%collective_hours%')
ORDER BY p.proname;

-- 3. Publication/Realtime : ne retourne que des noms et paramètres de réplication.
SELECT pubname, schemaname, tablename
FROM pg_publication_tables
WHERE schemaname = 'public'
  AND tablename IN ('time_sessions','company_users','users');
SELECT relname, relreplident FROM pg_class WHERE oid = 'public.time_sessions'::regclass;
SELECT trigger_name, event_manipulation, action_statement
FROM information_schema.triggers
WHERE event_object_schema='public' AND event_object_table='time_sessions';

-- 4. Contrôle agrégé non personnel des sessions (identité Auth démontrée).
SELECT COUNT(*) AS total_sessions,
  COUNT(*) FILTER (WHERE user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') AS uuid_sessions,
  COUNT(*) FILTER (WHERE punch_end_at IS NOT NULL) AS sessions_terminees,
  COUNT(*) FILTER (WHERE punch_end_at IS NULL) AS sessions_ouvertes,
  COUNT(*) FILTER (WHERE corrected_start_at IS NOT NULL OR corrected_end_at IS NOT NULL) AS sessions_corrigees,
  COUNT(*) FILTER (WHERE punch_start_at IS NOT NULL AND punch_end_at IS NOT NULL AND
    COALESCE(corrected_end_at,punch_end_at) < COALESCE(corrected_start_at,punch_start_at)) AS intervalles_invalides
FROM public.time_sessions;
