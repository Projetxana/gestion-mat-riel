-- Remplace et sécurise la fonction RPC get_user_company_id
-- Utilise le cast explicite de auth.uid() en TEXT pour correspondre au user_id de company_users (s'il est stocké en TEXT).

CREATE OR REPLACE FUNCTION public.get_user_company_id()
RETURNS BIGINT
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT company_id
  FROM public.company_users
  WHERE user_id = auth.uid()::text
  LIMIT 1;
$$;
