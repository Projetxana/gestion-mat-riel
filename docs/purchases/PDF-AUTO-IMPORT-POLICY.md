# BuildTrack — PDF numériques : import automatique, contrôle par exception

**Décision produit du 22 novembre 2026** : ne pas demander une validation ligne par ligne lorsque la preuve documentaire est cohérente. Le budget ou la commande s'enregistre automatiquement à la suite de l'import et l'interface affiche une confirmation, pas un formulaire de validation.

## Parcours cible (dans Suivi projets → Chantier → Achats)
1. Administrateur sélectionne le **PDF numérique** d'estimation ou de confirmation de commande.
2. Lecture locale du texte PDF avec PDF.js (à connecter au build Vite) ou conversion serveur dans les branches OCR existantes ; aucune image/IA nécessaire pour un PDF numérique avec couche texte exploitable.
3. Parser du fournisseur/estimation extrait automatiquement le chantier, PO, lignes, unités, montants et compte les pages/lignes. Calcul du montant engagé sur **commandé**, et non sur livré (un BO ne diminue pas automatiquement le montant commandé).
4. Le moteur `assessPdfAutoImport` classe **auto_commit** seulement si TOUT est prouvé : bonne entreprise/chantier actif, nom de livraison identique, PO et fournisseur (commandes), aucun PO déjà enregistré, PDF numérique avec toutes ses pages, mise en page reconnue, empreinte SHA-256, nombre de lignes vérifiable, lignes complètes, calculs cohérents et total matériel imprimé correspondant aux lignes reconnues.
5. **auto_commit** : appeler les RPC Supabase existantes `bt_purchase_import_budget` ou `bt_purchase_create_order` (auth administrateur + RLS) une seule fois, puis actualiser la synthèse Achats. Confirmation discrète « PDF importé : N articles, X $ ».
6. **attention_required** : ne rien enregistrer. Présenter une alerte courte « Ce PDF nécessite votre attention » avec les champs concernés : chantier différent, PO en double, montant incohérent, page/tableau absent, etc. L'administrateur peut corriger exceptionnellement ; aucun contrôle répétitif des lignes normales.

## État réel du code
- `src/utils/pdfAutoImportPolicy.js` et `tests/pdf-auto-import.test.mjs` : **moteur de décision prêt et testé** ; les conditions positives et négatives sont explicites.
- **À réaliser avant publication** : extraction PDF.js dans le navigateur (y compris worker Vite/iOS), reconnaissance fiable du total imprimé et du nombre de lignes/pages depuis chaque gabarit réel, liaison aux RPC et affichage du succès/exception. La conversion via Cloudflare et l'ancienne interface Documents restent en PR de développement.
- Les données réelles de production, les heures et l'IPMO ne sont pas modifiées.
- Ne pas affirmer qu'un PDF est complet parce qu'il contient du texte. La structure visuelle et l'ordre d'extraction peuvent diverger. Le code refuse donc le mode automatique si une preuve manque.

## Tests ciblés
- PDF complet cohérent : **aucun clic de validation**.
- PO déjà importé ou chantier différent : aucune écriture.
- Quantités commandées vs livrées/BO : coût engagé sur la commande.
- Page manquante, total absent, calcul incohérent, ligne illisible : alerte.
- Budget initial figé : import répété refusé.
- Traçabilité : fichier SHA-256, nom du document et journal de l'import à prévoir.

Il faut relier le moteur à la lecture effective des PDF avant de revendiquer que l'intégration complète fonctionne en production.
