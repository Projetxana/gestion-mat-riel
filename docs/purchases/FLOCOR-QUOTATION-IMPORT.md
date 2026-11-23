# BuildTrack — Soumissions Flocor (QUOTATION / SOUMISSION)

## Type de document

Les devis Flocor ne sont **pas** les confirmations de commande « COMMANDE DE VTE / CONFIRMATION » déjà supportées.

- La soumission peut être utilisée comme **proposition de budget matériel** dans « Détail des achats → Budget → Remplacer l'estimation / Ajouter une liste complémentaire ».
- Une soumission ne crée **jamais** de bon de commande, ni une dépense engagée ou facturée.
- Si le PDF est déposé dans « Commandes », l'utilisateur doit être redirigé vers Budget ou invité à fournir une vraie confirmation de commande.
- Même lorsque le document est intégralement lu et réconcilié, **aucun enregistrement automatique** n'est autorisé pour une soumission.

## Extraction (entièrement locale)

- Marqueurs : « FLOCOR », « QUOTATION », « SOUMISSION » et `# <numéro> <nom du projet>`.
- Les lignes comportent un numéro de séquence, une quantité, une unité, une référence fournisseur, une description, un prix unitaire et un montant étendu.
- Les continuations de description et références « Alias : ART... » sont conservées lorsque reconnues.
- Les numéros de séquence Flocor ne sont **pas nécessairement consécutifs**; leur continuité n'est pas une preuve de complétude.
- Le sous-total hors taxes « Sub-total/ Sous-total » de la dernière page est rapproché de la somme des montants des lignes, au cent près.
- Le nombre d'ancres de lignes doit correspondre au nombre d'articles extraits. Les colonnes ambiguës ou lignes incomplètes restent signalées.
- Les taxes, les frais et le total TTC ne deviennent jamais des lignes de matériel.

## Revue et enregistrement

- Les lignes reconnues préremplissent l'éditeur de validation existant.
- L'administrateur peut corriger, ajouter, inclure/exclure les articles et inspecter le texte source.
- Il confirme le chantier, le nombre d'articles matériels, le sous-total ou l'écart, et la complétude.
- Le total avant/après et le maintien des avenants et commandes sont explicitement montrés.
- Les conditions du fournisseur peuvent restreindre la validité du prix; l'administrateur doit lire l'original.
- Aucun changement de schéma Supabase; utilise la RPC `bt_purchase_add_budget_revision` et le contrôle d'accès existants.
- Le PDF d'origine n'est pas encore stocké dans BuildTrack; conserver l'original dans le dossier documentaire du chantier.

## Vérification

`npm run test:pdf-import` comprend `flocor-quotation-parser.test.mjs` : marqueurs, nombre de lignes, prix fractionnaires, alias, sous-total, couverture multipage, absence d'import automatique, mauvais chantier et refus de la soumission comme PO.

Une vraie soumission de cinq pages a également été contrôlée **localement sans copier ses données sensibles dans le dépôt**. Les lignes, montants et sous-total ont été rapprochés avant ajout de l'adaptateur.
