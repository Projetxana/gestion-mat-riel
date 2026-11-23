# BuildTrack — Contrôle des prix fournisseurs par soumission

## Besoin métier (A1 Cash & Carry)

Une soumission du fournisseur Flocor définit un **prix unitaire de référence** pour le chantier, **indépendant** du coût prévu dans l'estimation initiale. Chaque confirmation de commande tarifée (et, ultérieurement, tout justificatif tarifé de livraison) doit permettre de signaler une hausse de prix *même si le budget global n'est pas dépassé*.

Le PDF de référence n° **2051538**, 20 octobre 2026, contient 80 articles matériels et un sous-total de **57 062,03 $ hors taxes**. La somme des lignes a été rapprochée localement du sous-total de la page 5. Les données de l'utilisateur ne sont pas copiées dans le dépôt GitHub.

## Fonctionnement implémenté

1. Détail des achats > Budget > **Soumission fournisseur · Prix de référence** > importer le PDF Flocor.
2. Vérifier le chantier, les 80 références, les unités, prix par unité, quantités et sous-total; corriger manuellement au besoin.
3. Confirmer. La RPC atomique `bt_supplier_price_register` ajoute une **version immuable** des prix fournisseur dans deux tables à accès administrateur uniquement. L'estimation et les commandes existantes ne changent pas.
4. Les confirmations fournisseur tarifées déjà importées et les prochaines commandes sont rapprochées automatiquement via référence fournisseur exacte ou alias client déclaré sur le PDF. Seuls les codes + unités concordants sont retenus.
5. **Alerte** si prix unitaire confirmé supérieur à celui de la soumission, avec référence, prix prévu, prix confirmé, écart unitaire et surcoût sur la quantité commandée (HT).
6. Les produits sans code correspondant, aux unités incompatibles ou aux prix de soumission ambigus vont dans « À rapprocher ». Un administrateur peut créer une correspondance explicite, conservée et vérifiée par RLS. Aucun faux rapprochement automatique par description.
7. Avant l'enregistrement automatique d'une confirmation PDF, toute hausse reconnue, absence de référentiel ou ligne incertaine force une **validation humaine**. La commande peut être enregistrée après acceptation explicite; le dépassement reste visible.

## Données et sécurité

- `bt_supplier_price_quotes` : version de soumission, chantier, entreprise, fournisseur, numéro, date, origine, empreinte SHA-256, total, auteur.
- `bt_supplier_price_lines` : prix unitaire (4 décimales), unité, code Flocor et alias client, quantité et montant hors taxes, lien à la version.
- `bt_supplier_price_line_links` : associations manuelles *ligne de commande → ligne de soumission*, limitées à la même entreprise, chantier, fournisseur et unité.
- Import dans une RPC `SECURITY INVOKER`, contrôle administrateur, RLS admin, validation des lignes et du sous-total, opération atomique et refus des doublons via empreinte.
- La première importation n'est **pas** une commande engagée et n'incrémente aucun montant de dépenses.
- Les versions sont append-only. La dernière soumission fournisseur importée sert de **référence active** pour les comparaisons; les versions anciennes restent stockées pour audit. Un lien vers une ancienne version non active doit être revalidé.
- Aucune modification des tables d'heures, des mesures IPMO, de l'estimation ni des lignes de PO existantes.
- L'original PDF n'est pas encore sauvegardé sur un stockage documentaire privé. Garder le PDF source dans les documents du chantier.

## Limites à respecter

- **Les bons de livraison sans prix n'établissent pas le prix réellement facturé** et ne déclenchent pas de fausse alerte de surcoût. Ce MVP compare les lignes tarifées dans `bt_purchase_order_lines` (confirmations de commande enregistrées). L'import autonome des factures et des justificatifs de livraison tarifés reste un workflow distinct non encore développé.
- Les changements commerciaux de prix (nouveau devis, avenants) doivent être importés et confirmés par l'administrateur; ne pas écraser rétroactivement l'historique des soumissions.
- Les commandes déjà enregistrées sont recalculées automatiquement dès qu'une référence est importée, **sans toucher aux coûts historiques**.
- Ne pas considérer un article « non rapproché » comme une hausse; une association n'est valide qu'après confirmation du code ou choix explicite.
- Les centimes d'impact sont calculés sur le différentiel de prix unitaire multiplié par la quantité du PO. Les montants HT excluent TPS/TVQ et transport.
- Le devis Flocor mentionne une validité de 30 jours et une clause de prix jusqu'à fin décembre 2026; une hausse après cette période exige une vérification commerciale, mais demeure une alerte utile.

## Activation

Migration proposée `migrations/bt_supplier_quote_price_watch_20261123_PROPOSED.sql` (non exécutée sur la production). Tester la restauration, l'application sur branche Supabase isolée, les cas RLS, les tests Node et une prévisualisation de l'interface avant publication. `npm run test:pdf-import` inclut le prix fournisseur; `npm run build` lance les tests de régression.

La branche fonctionnelle diverge de `main` : fusionner la branche entière directement dans `main` sans vérifier les changements connexes n'est pas autorisé.
