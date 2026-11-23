# BuildTrack · Réviser l'estimation et ajouter des listes complémentaires

## Décision d'architecture
Le budget initial de BuildTrack est historiquement immuable. **On ne remplace pas ses lignes par un DELETE ou un UPDATE.**

Deux opérations sont ajoutées au formulaire existant **Suivi des projets → Chantier → Détail des achats → Budget** :

1. **Remplacer l'estimation de base** : enregistre une nouvelle version entière des matériaux estimés, rend cette version active et conserve toutes les précédentes pour audit. Les avenants déjà enregistrés ne sont pas supprimés.
2. **Ajouter une liste complémentaire** : stocke une nouvelle liste de matériaux (extension, modification de portée, ajout de bâtiment) avec un libellé distinct. Elle est additionnée au budget matériel actif. Plusieurs listes peuvent être ajoutées.

Le total effectif = **dernière estimation de base** (ou estimation initiale si aucune révision) + **somme de tous les avenants**. Le montant « Commandes engagées » provient exclusivement des PO historiques, jamais des listes d'estimation.

## Données et sécurité
- Table nouvelle \`bt_purchase_budget_revisions\` : identifiant, chantier, entreprise, N° de version, type, source, libellé, hash SHA-256, auteur, date, nombre de lignes, montant.
- Colonne \`bt_purchase_budget_lines.revision_id\` ajoutée à la table existante. Toutes les lignes anciennes conservent \`NULL\`, sans modification.
- \`bt_purchase_add_budget_revision(...)\` : RPC atomique \`SECURITY INVOKER\` avec RLS administrateur et verrou de transaction par entreprise/chantier, validation des champs et refus d'un hash déjà importé.
- \`bt_purchase_effective_budget_lines(...)\` : source de vérité SQL des lignes actives pour l'écran Achats ET la synthèse Suivi projets.
- Aucune modification de \`bt_purchase_orders\`, \`bt_purchase_order_lines\`, des heures ou de l'IPMO.
- Les correspondances manuelles fournisseur → estimation continuent de pointer vers leurs anciennes lignes historiques. Après remplacement, une correspondance pointant vers une ancienne ligne est volontairement **non rapprochée**, afin d'éviter de l'attribuer au mauvais matériau. L'administrateur peut la réassocier via l'interface existante.
- Il n'y a pas de suppression des révisions dans cette première version; correction = créer une nouvelle estimation révisée.
- Les PDF sont analysés localement sur l'appareil. Le fichier PDF **binaire n'est pas encore conservé** sur un stockage documentaire; seuls les articles, leur origine et l'empreinte sont enregistrés.

## Import
PDF numériques reconnus par les lecteurs existants (notamment estimation CD), Excel/CSV en secours.
- S'il n'y a aucune anomalie, le PDF préremplit les lignes, puis une seule action enregistre l'avenant/la nouvelle base. **Aucune validation ligne par ligne.**
- Les rapports CD multi-scénarios peuvent afficher des coûts non matériels ou des ajustements globaux. Un rapport ayant seulement un écart entre total global et total matériel, sans ligne manquante ni erreur d'unité, peut être confirmé **une fois** en affichant le nombre d'articles et le total matériel retenu.
- Si la reconnaissance automatique échoue (chantier absent, fournisseur inconnu, total non identifié, couverture partielle), **le PDF numérique lisible ouvre désormais une revue manuelle**, au lieu d'être rejeté en bloc. Les lignes proposées ne sont jamais enregistrées sans action de l'administrateur.
- La revue permet de corriger les références, quantités, unités, prix et montants, d'exclure/ajouter des lignes et de consulter le texte local extrait. Sans ligne détectée, une ligne vide permet la saisie manuelle. Une extraction générique prudente donne des propositions pour les tableaux séparés par colonnes, jamais une preuve de complétude.
- L'administrateur confirme obligatoirement le chantier (nom exact si différent/absent), le nombre de lignes matérielles incluses, le total hors taxes ou son absence, les écarts avec le document et l'exhaustivité vérifiée. Échec immédiat en cas de ligne invalide ou quantité × prix incohérente. Une seconde confirmation précède l'enregistrement RPC.
- Un PDF scanné sans texte exploitable, incomplet, corrompu ou excessivement volumineux reste non importable par ce flux. L'IA OCR payante reste désactivée; une version Excel/CSV est l'alternative.
- Un remplacement affiche le total avant/après et demande une confirmation **unique** (action budgétaire importante).

## Tests
\`npm run test:budget-revisions\` couvre base historique, remplacement successif, liste d'extension conservée, calculs, liens historiques devenus non actifs et présence des boutons UI.
La suite PostgreSQL 17 \`tests/purchases-budget-revisions-postgres.sql\` valide les révisions atomiques, la sauvegarde des POs, les empreintes dupliquées, l'isolation employé / entreprise et le refus d'accès anonyme.
Les tests du suivi des heures, IPMO, achats et PDF existants restent dans \`npm run build\`.

## Activation
Migration additive \`migrations/bt_purchase_budget_revisions_20261123_PROPOSED.sql\`. Avant publication vérifier la sauvegarde et le test de restauration, les tests PG17, et le rendu mobile. Une fois migré, la synthèse « Suivi projets » et l'écran Budget utilisent tous deux la RPC de lignes actives.
