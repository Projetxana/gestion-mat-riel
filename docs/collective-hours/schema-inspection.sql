-- Lecture seule : aucune donnée personnelle.
SELECT table_name,column_name,data_type,udt_name FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('sites','project_tasks','time_sessions','users','company_users') ORDER BY table_name,ordinal_position;
SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public';
SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r';
SELECT routine_name, grantee, privilege_type FROM information_schema.routine_privileges WHERE routine_schema='public';
SELECT table_name,grantee,privilege_type FROM information_schema.table_privileges WHERE table_schema='public';
-- Identité et contraintes, sans lecture de données métier.
SELECT c.relname, con.conname, pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('users','company_users','time_sessions','sites','project_tasks');
SELECT pubname, schemaname, tablename FROM pg_publication_tables WHERE tablename IN ('time_sessions','users','company_users');
SELECT c.relname,c.relreplident FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='time_sessions';
SELECT trigger_name,action_statement FROM information_schema.triggers WHERE event_object_schema='public' AND event_object_table='time_sessions';
