-- ==============================================================================
-- FIX: get_user_company_id()
-- 
-- PROBLÈME: La fonction retourne BIGINT mais companies.id est UUID depuis
-- la migration 20260401_migrate_company_id_to_uuid.sql.
-- Le fichier fix_get_company_id.sql a écrasé la bonne version UUID
-- avec une version BIGINT, cassant la résolution du company_id.
--
-- CE SCRIPT: Recrée la fonction avec le bon type de retour UUID.
-- NE TOUCHE PAS aux policies RLS.
-- ==============================================================================

-- 1. Supprimer la version cassée (BIGINT)
--    DROP FUNCTION est nécessaire car on change le type de retour
DROP FUNCTION IF EXISTS public.get_user_company_id();

-- 2. Recréer avec le type UUID correct
--    Même logique que get_user_company_id_debug, mais utilise auth.uid() au lieu d'un paramètre
CREATE OR REPLACE FUNCTION public.get_user_company_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT company_id
  FROM public.company_users
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- 3. Vérification (à exécuter manuellement après le script)
-- SELECT public.get_user_company_id();
-- Devrait retourner le même UUID que:
-- SELECT public.get_user_company_id_debug(auth.uid());
