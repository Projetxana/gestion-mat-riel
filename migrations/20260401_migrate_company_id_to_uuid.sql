-- ==============================================================================================
-- Migration : Conversion de company_id (BIGINT) vers (UUID)
-- Description : Migre l'ID de la table 'companies' vers UUID tout en conservant 
-- les relations étrangères à travers toutes les tables métier de l'application.
-- Contraintes requises : Exécution au sein d'une seule transaction SQL.
-- ==============================================================================================

BEGIN;

-- 1. Ajout de la colonne temporaire (UUID généré automatiquement) sur companies
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS new_id UUID DEFAULT gen_random_uuid();
-- (Tous les enregistrements existants recevront un nouvel UUID automatiquement)

-- 2. Ajout de la colonne company_id_uuid (temporaire) sur TOUTES les tables concernées
ALTER TABLE public.company_users ADD COLUMN IF NOT EXISTS company_id_uuid UUID;
ALTER TABLE public.invites ADD COLUMN IF NOT EXISTS company_id_uuid UUID;
ALTER TABLE public.company_modules ADD COLUMN IF NOT EXISTS company_id_uuid UUID;
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS company_id_uuid UUID;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS company_id_uuid UUID;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS company_id_uuid UUID;
ALTER TABLE public.logs ADD COLUMN IF NOT EXISTS company_id_uuid UUID;
ALTER TABLE public.time_sessions ADD COLUMN IF NOT EXISTS company_id_uuid UUID;
ALTER TABLE public.project_tasks ADD COLUMN IF NOT EXISTS company_id_uuid UUID;
ALTER TABLE public.weekly_timesheets ADD COLUMN IF NOT EXISTS company_id_uuid UUID;
ALTER TABLE public.weekly_timesheet_entries ADD COLUMN IF NOT EXISTS company_id_uuid UUID;

-- 3. Mapping des données (BIGINT -> UUID)
-- Transfert de tous les anciens company_id (BIGINT) vers le nouvel UUID correspondant
UPDATE public.company_users t SET company_id_uuid = c.new_id FROM public.companies c WHERE t.company_id = c.id;
UPDATE public.invites t SET company_id_uuid = c.new_id FROM public.companies c WHERE t.company_id = c.id;
UPDATE public.company_modules t SET company_id_uuid = c.new_id FROM public.companies c WHERE t.company_id = c.id;
UPDATE public.materials t SET company_id_uuid = c.new_id FROM public.companies c WHERE t.company_id = c.id;
UPDATE public.sites t SET company_id_uuid = c.new_id FROM public.companies c WHERE t.company_id = c.id;
UPDATE public.tasks t SET company_id_uuid = c.new_id FROM public.companies c WHERE t.company_id = c.id;
UPDATE public.logs t SET company_id_uuid = c.new_id FROM public.companies c WHERE t.company_id = c.id;
UPDATE public.time_sessions t SET company_id_uuid = c.new_id FROM public.companies c WHERE t.company_id = c.id;
UPDATE public.project_tasks t SET company_id_uuid = c.new_id FROM public.companies c WHERE t.company_id = c.id;
UPDATE public.weekly_timesheets t SET company_id_uuid = c.new_id FROM public.companies c WHERE t.company_id = c.id;
UPDATE public.weekly_timesheet_entries t SET company_id_uuid = c.new_id FROM public.companies c WHERE t.company_id = c.id;

-- 4. Nettoyage des anciennes relations (Foreign Keys)
-- Nous devons supprimer les FK existantes basées sur la colonne BIGINT avant de les remplacer
ALTER TABLE public.company_users DROP CONSTRAINT IF EXISTS company_users_company_id_fkey;
ALTER TABLE public.invites DROP CONSTRAINT IF EXISTS invites_company_id_fkey;
ALTER TABLE public.company_modules DROP CONSTRAINT IF EXISTS company_modules_company_id_fkey;
ALTER TABLE public.materials DROP CONSTRAINT IF EXISTS materials_company_id_fkey;
ALTER TABLE public.sites DROP CONSTRAINT IF EXISTS sites_company_id_fkey;
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_company_id_fkey;
ALTER TABLE public.logs DROP CONSTRAINT IF EXISTS logs_company_id_fkey;
ALTER TABLE public.time_sessions DROP CONSTRAINT IF EXISTS time_sessions_company_id_fkey;
ALTER TABLE public.project_tasks DROP CONSTRAINT IF EXISTS project_tasks_company_id_fkey;
ALTER TABLE public.weekly_timesheets DROP CONSTRAINT IF EXISTS weekly_timesheets_company_id_fkey;
ALTER TABLE public.weekly_timesheet_entries DROP CONSTRAINT IF EXISTS weekly_timesheet_entries_company_id_fkey;

-- 5. Remplacement dans la table maîtresse (companies)
-- On supprime l'ancienne Clé Primaire et l'ancienne colonne
ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_pkey CASCADE;
ALTER TABLE public.companies DROP COLUMN id CASCADE;

-- On finalise le nouveau format UUID
ALTER TABLE public.companies RENAME COLUMN new_id TO id;
ALTER TABLE public.companies ADD PRIMARY KEY (id);

-- 6. Remplacement dans les tables métier
-- Suppressions des colonnes BIGINT
ALTER TABLE public.company_users DROP COLUMN company_id;
ALTER TABLE public.invites DROP COLUMN company_id;
ALTER TABLE public.company_modules DROP COLUMN company_id;
ALTER TABLE public.materials DROP COLUMN company_id;
ALTER TABLE public.sites DROP COLUMN company_id;
ALTER TABLE public.tasks DROP COLUMN company_id;
ALTER TABLE public.logs DROP COLUMN company_id;
ALTER TABLE public.time_sessions DROP COLUMN company_id;
ALTER TABLE public.project_tasks DROP COLUMN company_id;
ALTER TABLE public.weekly_timesheets DROP COLUMN company_id;
ALTER TABLE public.weekly_timesheet_entries DROP COLUMN company_id;

-- Renommage des colonnes temporaires en "company_id" définitifs
ALTER TABLE public.company_users RENAME COLUMN company_id_uuid TO company_id;
ALTER TABLE public.invites RENAME COLUMN company_id_uuid TO company_id;
ALTER TABLE public.company_modules RENAME COLUMN company_id_uuid TO company_id;
ALTER TABLE public.materials RENAME COLUMN company_id_uuid TO company_id;
ALTER TABLE public.sites RENAME COLUMN company_id_uuid TO company_id;
ALTER TABLE public.tasks RENAME COLUMN company_id_uuid TO company_id;
ALTER TABLE public.logs RENAME COLUMN company_id_uuid TO company_id;
ALTER TABLE public.time_sessions RENAME COLUMN company_id_uuid TO company_id;
ALTER TABLE public.project_tasks RENAME COLUMN company_id_uuid TO company_id;
ALTER TABLE public.weekly_timesheets RENAME COLUMN company_id_uuid TO company_id;
ALTER TABLE public.weekly_timesheet_entries RENAME COLUMN company_id_uuid TO company_id;

-- 7. Recréation de toutes les Foreign Keys vers l'ID (UUID)
ALTER TABLE public.company_users ADD CONSTRAINT company_users_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.invites ADD CONSTRAINT invites_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.company_modules ADD CONSTRAINT company_modules_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.materials ADD CONSTRAINT materials_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.sites ADD CONSTRAINT sites_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.logs ADD CONSTRAINT logs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.time_sessions ADD CONSTRAINT time_sessions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.project_tasks ADD CONSTRAINT project_tasks_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.weekly_timesheets ADD CONSTRAINT weekly_timesheets_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.weekly_timesheet_entries ADD CONSTRAINT weekly_timesheet_entries_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- (Optionnel mais recommandé) Remettre l'unicité sur company_users et company_modules
ALTER TABLE public.company_users ADD CONSTRAINT company_users_company_id_user_id_key UNIQUE(company_id, user_id);
ALTER TABLE public.company_modules ADD CONSTRAINT company_modules_company_id_module_name_key UNIQUE(company_id, module_name);

-- 8. Mise à jour de la fonction RPC 'get_user_company_id' pour supporter le retour UUID
-- Vu qu'on change la valeur de retour (BIGINT -> UUID), on DOIT utiliser DROP FUNCTION avant de recréer.
DROP FUNCTION IF EXISTS public.get_user_company_id();

CREATE OR REPLACE FUNCTION public.get_user_company_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT company_id
  FROM public.company_users
  WHERE user_id = auth.uid()::text
  LIMIT 1;
$$;

COMMIT;
-- Fin de la transaction sécurisée
