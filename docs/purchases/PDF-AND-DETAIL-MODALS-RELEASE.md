# BuildTrack — Import PDF numérique et fenêtres de détail séparées

## Parcours existant conservé
`Accueil → Suivi des projets → Cash and Carry (ou un autre chantier)` ouvre la synthèse heures / IPMO / achats.
- Bouton **Détail avancement / IPMO** : une nouvelle fenêtre modale plein écran iPhone / centrée desktop, avec la **croix X** pour revenir à la synthèse du chantier. L'éditeur de pourcentages par tâche et la validation IPMO sont inchangés.
- Bouton **Détail des achats** : une seconde fenêtre indépendante, avec **croix X** et retour à la même synthèse. La section Budget / Commandes conserve le design existant.
- Échap et le clic sur le voile ferment uniquement la fenêtre de détail ; focus clavier restitué à l'action de départ.

## Lecture des PDF numériques (aucun fournisseur OCR)
Le décodeur `pdfjs-dist` v5 est servi depuis les actifs locaux de BuildTrack. Chargement à la demande ; chaque page est convertie en texte avec coordonnées, puis les lignes sont réorganisées avant lecture par les adaptateurs Flocor et rapport CD multi-scénario.
- **Budget** : `Achats → Budget → Importer le budget PDF automatiquement`.
- **Commande** : `Achats → Commandes → Importer une confirmation PDF automatiquement`.
- Si le nom du chantier, PO/fournisseur, toutes les lignes/pages, les unités, montants et le total imprimé sont prouvés, la RPC Supabase enregistre automatiquement l'import sans écran de relecture.
- Sinon, **aucun import automatique** et une liste courte d'anomalies apparaît. Le formulaire existant sert alors à corriger manuellement uniquement le document en question.
- PDF image sans texte sélectionnable : refus explicite ; OCR reste une étape distincte.
- Excel/CSV demeure disponible. Aucun changement au scanner de bons ni aux courriels comptables.

## Cas de validation sur les deux fichiers de référence (lecture locale, sans copie dans GitHub)
- **Flocor** : 3 pages, 25 lignes produits reconnues, 25 lignes source, sous-total hors taxes de 4 180,72 $ concordant ; plusieurs produits ont seulement une référence fournisseur, suffisante pour saisir une commande.
- **Estimation CD multi-scénario** : 6 pages, 283 lignes CD, prix selon `UN`, `CT`, `LG` et `PI`, ajustements et autres postes. Le total global du rapport ne correspond pas à une simple somme de lignes de matériel : l'import automatique doit donc classer ce cas comme *exception*, non créer un budget inexact.
- Ces constats sont issus d'une extraction locale des originaux. L'exactitude finale de PDF.js sur iPhone reste à vérifier avec une session test.

## Tests / diffusion
- `npm run test:pdf-import` : formats fournisseurs, politique de confiance, totaux imprimés, données absentes, fenêtre indépendante, croix et focus.
- `npm run build` et fixture PostgreSQL 17.
- **Aucune migration Supabase requise** : réutilise `bt_purchase_import_budget` et `bt_purchase_create_order` déjà publiées, avec restrictions administrateur et entreprise.
- Pour un premier vrai import en production, préférer un PO fournisseur **réel non encore enregistré** sur le chantier concerné ; tester le résultat dans la liste Commandes. Éviter d'envoyer plusieurs fois le même fichier après une réponse réseau incertaine : l'unicité fournisseur+PO bloque les doublons.
- Pas de validation/ocr automatique d'un PDF qui mélange les sous-totaux de livraison et les BO ; le montant engagé reste celui des quantités commandées, pas des quantités expédiées.

## Vérifications avant GO
1. CI GitHub + compilation Cloudflare verts.
2. Prévisualisation navigable avec compte administrateur et iPhone Safari.
3. Vérifier que la croix X revient à la bonne synthèse, sans quitter Suivi projets.
4. Tester un PDF numérique autorisé et un cas d'exception (mauvais chantier, PO déjà utilisé, total incohérent).
5. Valider qu'aucune modification n'a été faite dans les fonctions heures, IPMO et comptabilité.
