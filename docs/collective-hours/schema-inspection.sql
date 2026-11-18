-- Lecture seule : aucune donnée personnelle.
SELECT table_name,column_name,data_type,udt_name FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('sites','project_tasks','time_sessions','users','company_users') ORDER BY table_name,ordinal_position;
SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public';
SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r';
SELECT routine_name, grantee, privilege_type FROM information_schema.routine_privileges WHERE routine_schema='public';
SELECT table_name,grantee,privilege_type FROM information_schema.table_privileges WHERE table_schema='public';
