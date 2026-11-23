# BuildTrack — heures réalisées avant l'utilisation des pointages

## Demande
L'administrateur saisit, par exemple, 229 h à « Sous-sol 1 » et 222 h à « Sous-sol 2 » parce que le chantier a commencé avant les pointages dans BuildTrack. Cela doit apparaître immédiatement comme des heures **réellement enregistrées**, **sans valider le pourcentage d'avancement ni le bilan IPMO**.

## Données vérifiées, DJ 3 (23 novembre 2026)
- Sous-sol 1 : 229 h manuelles, budget 280 h.
- Sous-sol 2 : 222 h manuelles, budget 272 h.
- Run de 6 po sous-sol : 103 h manuelles, budget 80 h.
- Quatre entrées dans `time_sessions` concernent Sous-sol 1 : **40,5 h** cumulées. Un audit ultérieur a montré qu'elles portent toutes `manual_entry=true` : ce sont également des heures **saisies manuellement dans les feuilles de temps**, et non des pointages automatiques. Leur chevauchement avec les 229 h de la tâche n'est pas établi.
- Aucun rapport IPMO validé pour DJ 3.
- **Aucun enregistrement des heures existantes n'est modifié dans cette release.**

## Fonctionnement
1. Les heures dans `project_tasks.completed_hours` sont affichées avec la mention **Saisie manuelle**.
2. Dans la fiche du chantier, une section **Heures de démarrage** permet à l'administrateur de confirmer une seule fois que ces heures manuelles sont distinctes des pointages. La confirmation est persistante dans `bt_site_manual_hour_policies` (table séparée, RLS administrateur/entreprise).
3. Les barres présentent **Heures manuelles**, **Pointages employés** et **Total réalisé** :
   - Sans pointage sur une tâche, le total inclut immédiatement les heures manuelles, sans aucune validation.
   - Les entrées des **feuilles de temps manuelles** sont affichées séparément. Si la tâche possède déjà des heures manuelles, ces entrées ne sont **pas automatiquement additionnées**, même lorsque le réglage de démarrage est confirmé, car elles pourraient compter deux fois.
   - Avec de véritables pointages automatiques et un chevauchement incertain, les deux sources restent visibles mais le total n'est pas additionné.
   - Quand la distinction est confirmée pour le chantier, le total opérationnel additionne les heures saisies dans la tâche et les **pointages automatiques des employés seulement**. Les feuilles de temps saisies manuellement restent un poste distinct tant que leur rapprochement n'est pas connu.
4. **Indépendance IPMO :** aucun changement aux pourcentages, à `bt_performance_reports`, `bt_performance_report_tasks`, `bt_publish_performance_report` ou aux calculs d'IPMO. Les bilans déjà validés restent figés.

## Tests
- `npm run test:task-performance`, `npm run test:manual-startup-hours`
- `tests/manual-startup-hours-postgres.sql` (fixture PostgreSQL 17 avec RLS, administrateur/employé/autre entreprise).

## Diffusion et prudence
- Le réglage est **propre au chantier** ; ne pas appliquer automatiquement la distinction à toutes les entreprises et à tous les projets.
- Ce réglage n'est approprié que si les heures manuelles **ne figurent pas déjà** dans les pointages.
- En cas de chevauchement partiel, mieux vaut ne pas confirmer le cumul et corriger les heures manuelles avant de l'activer.
- Le paramètre peut être désactivé ultérieurement, sans supprimer les heures.

## Contrôle complémentaire avant l'intégration définitive
DJ 3 doit afficher **229 h** comptabilisées pour Sous-sol 1 et une indication séparée « **40,5 h saisies dans les feuilles de temps** », qui ne sont pas ajoutées automatiquement. Le total général basé uniquement sur les heures des tâches reste **554 h**, hors feuilles de temps manuelles susceptibles de faire doublon. Ce traitement est indépendant de l'IPMO.
