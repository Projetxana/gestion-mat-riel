-- BuildTrack: secure invitation acceptance, candidate only.
-- Execute AFTER reviewing Edge Function buildtrack-invite-user and user onboarding.
-- Use via supabase.rpc('bt_accept_invite_secure', { invite_token: token }).
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '20s';

CREATE OR REPLACE FUNCTION public.bt_accept_invite_secure(invite_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  caller_email text;
  invite_record record;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF invite_token IS NULL OR length(btrim(invite_token)) < 16 THEN
    RAISE EXCEPTION 'Invalid invitation' USING ERRCODE = '22023';
  END IF;

  -- Verified server-side auth identity, not user supplied email / user_metadata.
  SELECT lower(btrim(u.email)) INTO caller_email
  FROM auth.users u WHERE u.id = caller_id AND u.email_confirmed_at IS NOT NULL;
  IF caller_email IS NULL THEN
    RAISE EXCEPTION 'Verified email required' USING ERRCODE = '28000';
  END IF;

  SELECT i.id, i.company_id, i.email, i.status
    INTO invite_record
  FROM public.invites i
  WHERE i.token = invite_token
  FOR UPDATE;
  IF NOT FOUND OR invite_record.status IS DISTINCT FROM 'pending' OR
      lower(btrim(invite_record.email)) IS DISTINCT FROM caller_email OR
      invite_record.company_id IS NULL THEN
    RAISE EXCEPTION 'Invitation is invalid or not addressed to this user'
      USING ERRCODE = '28000';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.companies c WHERE c.id = invite_record.company_id
  ) THEN
    RAISE EXCEPTION 'Invitation references missing company';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.company_users cu
    WHERE cu.company_id = invite_record.company_id AND cu.user_id = caller_id
  ) THEN
    INSERT INTO public.company_users(company_id, user_id, role)
    VALUES (invite_record.company_id, caller_id, 'member');
  END IF;
  UPDATE public.invites SET status = 'accepted' WHERE id = invite_record.id;
  RETURN invite_record.company_id;
END;
$$;
REVOKE ALL ON FUNCTION public.bt_accept_invite_secure(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bt_accept_invite_secure(text) TO authenticated;
COMMIT;
