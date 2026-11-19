-- BuildTrack security release candidate: disable obsolete direct password-creating RPC.
-- DO NOT APPLY AUTOMATICALLY. Requires release authorization and final legacy-client check.
-- Verified 2026-11-19: current Settings.jsx uses buildtrack-invite-user Edge Function.
-- The legacy public.create_company_user() writes p_password verbatim to public.users
-- and can return the same field in row_to_json. It should never be a public API.
-- Revocation is transactional and does not delete users, auth credentials or data.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '20s';

DO $$
BEGIN
  IF to_regprocedure('public.create_company_user(text,text,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Unexpected legacy RPC signature; inspect production before proceeding';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.create_company_user(text,text,text,text,text)
  FROM PUBLIC, anon, authenticated;
-- Keep service_role for tightly controlled server-side compatibility only.
-- Follow-up: remove/replace the function entirely once all callers are audited.
COMMIT;

-- Verify with a separate read-only query:
-- SELECT has_function_privilege('anon',
--   'public.create_company_user(text,text,text,text,text)','EXECUTE') AS anon_can_execute,
--   has_function_privilege('authenticated',
--   'public.create_company_user(text,text,text,text,text)','EXECUTE') AS member_can_execute;
-- Both must return FALSE.
