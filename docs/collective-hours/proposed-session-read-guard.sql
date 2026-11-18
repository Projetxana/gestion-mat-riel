-- Proposition conditionnelle : exige users.auth_user_id et company_users liés à auth.uid().
-- À valider localement sur le schéma inspecté ; jamais appliquer automatiquement.
BEGIN;
ALTER TABLE public.time_sessions ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.can_read_time_session(session_user text, session_company text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS (
   SELECT 1 FROM public.company_users m
   WHERE m.user_id::text=auth.uid()::text AND m.company_id::text=session_company
   AND (m.role='admin' OR (m.role='member' AND EXISTS (
     SELECT 1 FROM public.users u WHERE u.id::text=session_user AND u.auth_user_id=auth.uid()
   )))
 );
$$;
REVOKE ALL ON FUNCTION public.can_read_time_session(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_time_session(text,text) TO authenticated;
-- Restrictive = AND avec les anciennes politiques permissives.
CREATE POLICY collective_session_read_guard ON public.time_sessions AS RESTRICTIVE
FOR SELECT TO authenticated USING (public.can_read_time_session(user_id::text,company_id::text));
CREATE POLICY collective_session_anon_guard ON public.time_sessions AS RESTRICTIVE
FOR SELECT TO anon USING (false);
COMMIT;
