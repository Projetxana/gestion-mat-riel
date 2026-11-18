# Suivi collectif — rapport et validation

## Résultat
Branche feature/collective-hours-progress, base hotfix/admin-production.
ProjectHoursProgress utilise uniquement une RPC agrégée, sans récupérer les sessions des collègues. Les deux préférences restent facultatives et fausses par défaut. WeeklySummary conserve ses calculs et son détail journalier ; son entrée est explicitement filtrée sur l'employé connecté. Les tableaux personnels par chantier/tâche sont masqués au profit du composant collectif indépendant. Les interfaces administrateur et chef existantes sont conservées.

## Contrat de calcul
Toutes les sessions terminées, depuis l'origine, sans filtre de semaine. Fin obligatoire, intervalle corrigé non négatif. duration_hours strictement positif fait autorité lorsqu'il existe ; sinon différence entre dates corrigées (prioritaires) ou originales. Les durées nulles/zéro utilisent les dates comme WeeklySummary. Aucun ajout de completed_hours importé : seule time_sessions est la source demandée. approved n'est pas utilisé : terminé ne signifie pas approbation administrative. Vérifier cette définition métier avant déploiement. Aucun arrondi avant somme ; affichage à une décimale. Budget absent, nul ou négatif : aucun pourcentage. Les tâches sans affectation valide restent incluses dans le total du chantier, sans ligne de tâche inventée.

## Sécurité
La RPC SECURITY DEFINER fixe search_path vide, qualifie les objets et vérifie auth.uid(), l'appartenance et un rôle reconnu à chaque appel. Pas de nom d'employé, user_id, session_id ou GPS dans la réponse. Accès anonyme révoqué. Le company_id fourni est validé côté serveur. Les sessions, chantiers, tâches et employés doivent appartenir à la même entreprise. Clés site_id + section_id ; homonymes distincts.

IMPORTANT : le dépôt contient des politiques permissives FOR ALL sur time_sessions et des anciennes politiques universelles sur project_tasks. La proposition n'élargit aucun accès mais ne répare pas ces politiques historiques : impossible de garantir la confidentialité globale sans inspection réelle. La livraison en production est bloquée tant que les accès SELECT/Realtime des employés aux sessions individuelles des collègues ne sont pas refusés. Préparer ensuite une migration ciblée de ces politiques selon les droits administrateur/chef réels, sans casser saisie, invitations ni rapports. Ne pas appliquer aveuglément les anciennes migrations.

## Compatibilité à confirmer
La proposition SQL est volontairement dans docs et non dans une migration auto-appliquée. Comparaisons d'identifiants en texte pour UUID/BIGINT ; elle exige les colonnes utilisées par l'application (section_id, company_id, corrected_start_at/end_at, project_id, planned_hours). duration_hours est optionnel via to_jsonb. Vérifier types des jointures site_id/project_id et users.id, lien company_users.user_id vers auth.uid(), rôle leader éventuel et absence de droits d'écriture des employés sur leur appartenance/rôle. Le modèle du dépôt autorise tous les chantiers de l'entreprise ; si des affectations existent en production, ajouter leur contrôle avant toute livraison. Vérifier aussi bornes/contraintes des durées et règles de pauses, aucun calcul de pause n'étant ajouté ici.

## Vérifications exécutées
- npm run build : succès.
- node --test tests/collective-hours.test.mjs : succès, PostgreSQL embarqué PGlite avec fixtures exclusivement fictives.
- ESLint du nouveau composant : succès.
- Test SQL : 16 h employé + 26 h collègue = 42 h ; correction de fin ; durée enregistrée prioritaire ; tâches/chantiers homonymes séparés ; exclusion sessions actives, intervalle inversé et autre entreprise ; refus entreprise étrangère, rôle anonyme et lecture directe des sessions dans le schéma de test ; réponse sans données individuelles.
- Docker indisponible (moteur arrêté) : pas de Supabase local complet, pas de validation PostgREST/Realtime ni des politiques réelles.
- Audit npm : 36 vulnérabilités signalées dans les dépendances, sans correction globale hors périmètre.

## Procédure avant déploiement (approbation obligatoire)
1. Exécuter schema-inspection.sql en lecture seule sur la base réelle ; ne partager aucun contenu de table personnel.
2. Adapter et relire la proposition selon les résultats ; auditer toutes les politiques permissives et les permissions company_users. Vérifier le comportement chef/admin.
3. Démarrer Docker puis une stack Supabase locale dédiée, sans liaison à un projet distant ; reproduire le schéma vérifié et charger des données fictives. Appliquer la proposition uniquement localement. Tester JWT employé/admin/autre entreprise/anonyme via PostgREST, accès direct time_sessions et abonnement Realtime.
4. Lancer npm ci, node --test tests/collective-hours.test.mjs et npm run build.
5. Preview locale : configurer uniquement URL/clé publique Supabase locale dans .env.local puis npm run dev -- --host 127.0.0.1. Aucun déploiement public préparé automatiquement. Ne jamais utiliser des données Protection CD réelles.
6. À 390 px et 1440 px : options désactivées, chantier seul, tâche seule, les deux ; 16 h personnelles inchangées, 42/50 h collectives = 84 %, budget dépassé, absent, erreur RPC/réessayer, changement de compte et d'entreprise. Comparer compte administrateur (rapports existants inchangés) et employé. Vérifier saisie manuelle, correction, invitation et rafraîchissement après saisie. Vérifications navigateur Web/mobile et comparaison connectée restent à exécuter ; aucune preview hébergée ni session réelle testée.
7. Obtenir l'approbation explicite avant migration, déploiement et fusion. Sauvegarde préalable, migration revue appliquée avant le frontend, vérifier logs et accès interentreprises. Retour arrière frontend puis DROP FUNCTION public.collective_hours_progress(text) si nécessaire ; aucune donnée métier à restaurer pour cette proposition.

## Révision après audit PR #6
La RPC accepte exclusivement admin/member. project_tasks.company_id et users.company_id ne sont plus requis par l'agrégat : l'entreprise de la tâche est celle du chantier parent ; celle d'une session est vérifiée contre le chantier. Les sessions historiques d'employés supprimés restent comptées. users.auth_user_id est requis par la proposition séparée de protection des lectures individuelles, à confirmer par inspection.

La vue est désormais hiérarchique : un chantier, son récapitulatif facultatif et ses tâches facultatives, sans duplication. Les budgets sont toujours planned_hours. Aucun changement dans logManualTime ni dans ses champs.

proposed-session-read-guard.sql ajoute une politique restrictive qui borne les anciennes politiques permissives : membre = ses sessions, administrateur = son entreprise, anonyme = refus. Elle ne crée aucun droit permissif et doit être testée avec le schéma réel avant adoption. Vérifier les écritures des tables d'appartenance et les éventuelles fonctions SECURITY DEFINER exposant time_sessions. Les chefs perdent volontairement l'accès aux sessions des collègues en tant que membres ; compatibilité des rapports chef à décider avant application. Pour Realtime, les événements INSERT/UPDATE doivent respecter le même SELECT ; examiner publication, replica identity, éventuels triggers Broadcast et suppression DELETE. Ne pas activer une publication exposant des détails de suppression sans test authentifié. La sécurité globale Realtime de production n'est pas certifiée.

Les anciennes mentions user/leader et project_tasks.company_id dans les hypothèses ci-dessus sont remplacées par cette révision. La conformité visuelle navigateur iPhone/ordinateur et le scénario complet 128/160 restent à vérifier ; PR toujours en brouillon.

## Révision de compatibilité avec la base réelle (17 novembre 2026)
- 7 sessions existantes utilisent des UUID Auth en texte (0 id bigint).
- time_sessions est déjà protégée par bt_stage2_time_select/insert/update/delete.
- L'ancienne proposition proposed-session-read-guard.sql était incompatible avec les UUID Auth et a été RETIRÉE.
- La nouvelle RPC ne modifie aucune politique RLS et inclut les chantiers/tâches à zéro heure.
- Les heures collectives sont brutes, sans pauses déduites ni approbation administrative : ce sont des indicateurs de consommation provisoires, pas une paie.
- Vérifier l'accès JWT du rôle employé/admin, les fonctions SECURITY DEFINER et Realtime avant tout déploiement.
- Scénario visuel requis : 160 h prévues / 128 consommées / 32 restantes / 80 %, tâches 42/50, 60/80, 26/30.

## Filtrage des chantiers pour les employés
- Employé membre : uniquement les chantiers où une session **terminée et valide** lui appartient ; les tâches et budgets affichés demeurent **collectifs**.
- Les chantiers sont classés par sa date de travail la plus récente (avec repli alphabétique).
- Administrateur : tous les chantiers de son entreprise ; aucun changement aux écrans administrateurs.
- Aucun employé ne reçoit les heures individuelles de ses collègues ; le serveur n'expose que les totaux agrégés et la date de son propre dernier pointage.
- Une session encore ouverte ne rend pas le chantier visible dans le récapitulatif collectif avant d'être terminée.
- Aucune migration, RLS, fusion ou publication n'est effectuée par ce correctif local.
