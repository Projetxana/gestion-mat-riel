# BuildTrack — Rapprochement des achats Cash & Carry

## Pourquoi la fenêtre annonçait 36 lignes
Le suivi comparait les articles **exclusivement** par code numérique interne CD / code client ART et par unité. Les codes fournisseur Flocor (par exemple `P10GV2`, `P10GV4`, `009V.2`) n'étaient pas liés à l'estimation CD ; les lignes achetées existaient bien dans les commandes, mais la colonne « 0 / prévu » signifiait « zéro rapproché », **pas** « zéro acheté ».

Vérification *lecture seule* le 23 novembre 2026 :
- Chantier `A1 Cash & Carry` : site 12.
- 83 lignes de budget initial, 77 436,35 $ HT.
- 40 lignes de commandes (2 PO Flocor `P02294` et `P02316`), 36 917,10 $ HT.
- Seulement 4 lignes rapprochées automatiquement par code et unité ; **36 lignes demeuraient non rapprochées**.
- Exemple : `CD 00020` estimation tuyau acier 2 po, prévu 3 239 PI ; deux commandes `P10GV2` pour 1 575 + 840 FT soit 2 415 PI (équivalence d'unité) existent déjà. Le vieux compteur 0 était trompeur.
- Exemple : `CD 00023` tuyau 4 po, prévu 714 PI ; fournisseur `P10GV4`, commandé 714 FT. Le code diffère, mais l'unité physique est comparable.

## Parcours après correctif
1. Suivi des projets → A1 Cash & Carry → Détail des achats → Budget.
2. Ouvrir « Comparer les quantités estimées et commandées ».
3. Tous les 83 articles de l'estimation restent consultables dans un panneau déroulant. Les nombres sont étiquetés « Rapproché » et le « Reste » devient « Écart provisoire » tant que des lignes commandées restent non rapprochées.
4. Ouvrir la liste des lignes non rapprochées. Les **PO, références fournisseur, quantités, unités et montants** sont affichés.
5. Choisir un article correspondant de l'estimation parmi les suggestions, puis **Associer à l'estimation** ; ou **Achat hors estimation** si le matériau n'était pas prévu.
6. Les associations sont stockées en base et persistent. Elles corrigent **seulement la comparaison de quantités**, pas les montants historiques engagés.
7. « Voir et corriger les correspondances enregistrées » permet de supprimer une erreur d'association et recommencer.

## Protection
- Migration additive `migrations/bt_purchase_line_links_20261123_PROPOSED.sql` : une table pour les références de rapprochement ; aucune modification des tables d'heures, des coûts ni des PO.
- RLS limité aux administrateurs de l'entreprise ; entreprise, chantier et unité compatible vérifiés au niveau SQL.
- L'application propose des correspondances, mais n'effectue jamais une association incertaine sans action admin.
- Un achat réalisé **hors des deux PO déjà importés** demeure inconnu à BuildTrack tant que sa commande n'est pas enregistrée. Ne pas l'interpréter comme un achat absent.

## Tests
- `npm run test:purchase-reconciliation` : double commande du tuyau 2 po, code fournisseur différent, comparaison à coût constant, produits hors estimation, suggestions et écrans.
- `tests/purchases-reconciliation-postgres.sql` : admin / employé / autre entreprise, autre chantier, unités incompatibles et droits RLS.
- Tests existants + build Vite.

## Prérequis de déploiement
Avant de rendre les boutons actifs : vérifier le fixture SQL, appliquer la migration additive, valider RLS en lecture seule, déployer le frontend et vérifier avec une session admin. Ne **pas** réimporter les deux commandes pour résoudre ce problème : cela générerait des doublons.
