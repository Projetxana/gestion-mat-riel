# BuildTrack — publication progressive du suivi heures / IPMO / achats

## Périmètre de cette release
Ajoute dans la fenêtre existante **Suivi des projets** :
- sélectionner Cash and Carry ou un autre chantier actif;
- voir une synthèse des heures/IPMO **au dernier bilan validé**, sans confondre les pointages récents et le bilan;
- voir le budget d'achats, le total des commandes engagées (hors taxes) et le solde **non engagé**;
- ouvrir le détail IPMO existant, saisir le pourcentage d'avancement des tâches et valider un nouveau bilan;
- ouvrir le détail Achats, importer le budget initial Excel/CSV et les confirmations Excel/CSV, confirmer le chantier de livraison et enregistrer les commandes.

**Ne publie pas encore** : courriels entrants, OCR, stockage documentaire, nouveaux scans ou changements à l'envoi comptable existant. Ces options restent dans des PR séparées.

## Ordre de publication
1. Vérifier le point de retour (dernier SHA de production / sauvegarde Supabase) et la branche Cloudflare associée au domaine `app.buildtrackapp.ca`. Ne pas déployer dans une simple branche preview par erreur.
2. Vérifier la migration proposée `migrations/bt_purchases_mvp1_PROPOSED.sql` contre les types de la base actuelle ; elle crée **quatre tables neuves** et **deux RPC**, avec RLS administrateur/entreprise et sans altérer aucune table existante.
3. Vérifier les tests de confidentialité sur PostgreSQL 17 et les tests React/Node dans GitHub Actions.
4. Appliquer la migration après sauvegarde contrôlée et test de récupération. Vérifier : nouvelles tables, RLS, GRANT, fonctions disponibles, et aucune ligne réelle créée par les tests.
5. Déployer cette PR sur la branche **effectivement reliée au domaine de production**. S'assurer que le commit visible est celui de cette release.
6. Faire un smoke test en administrateur : Suivi projets → Cash and Carry → Synthèse → détail IPMO → détail Achats, sans encore enregistrer de vraie commande. Puis importer un petit budget fictif et une commande fictive dans un chantier test seulement si un chantier test isolé est disponible.

## Contrôles importants
- Aucun employé ne peut consulter les montants d'achats.
- Un budget absent ne doit pas être affiché comme 0 % de progression : état « Non importé ».
- Le pourcentage Achats = **commandes engagées / budget matériel initial** (pas volume reçu, pas facture, pas marge).
- Pas de factures, ni d'opérations comptables.
- Les tableaux du suivi n'affichent que les chantiers actifs avec budget d'heures.
- Le changement d'IPMO doit être validé par la RPC existante, pas recalculé au clic.
- Un PO attribué à un autre chantier doit être refusé ou explicitement confirmé.
- Retour arrière : revenir au commit frontend précédent ; les tables achats restent isolées et peuvent être conservées sans affecter les heures.

## État initial observé le 22 novembre 2026
- PostgreSQL 17 et `public.bt_stage2_is_admin(uuid)` sont présents.
- Les tables `bt_purchase_*` ne sont **pas** présentes dans BuildTrack production.
- Aucun changement Supabase de production n'est fait simplement en créant cette branche/PR.
- Les fichiers d'OCR, de Cloudflare Email Routing et de nouvel envoi de bons sont **exclus** pour éviter de casser les scans actuels.

## Conditions avant de déclarer « intégré en production »
Le commit doit être visible sur `app.buildtrackapp.ca`, la migration présente dans Supabase, les droits administrateur/employé vérifiés, et le circuit budget + commandes fonctionnel. Une prévisualisation Pages ne suffit pas à satisfaire ce critère.
