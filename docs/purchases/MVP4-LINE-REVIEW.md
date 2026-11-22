# BuildTrack — MVP4 : articles extraits, validation administrateur et livraisons

**État : PR en brouillon, sans changement de production.** Cette étape s'appuie sur #41 (réception courriel, OCR privé), elle-même sur #40 et #39.

## Fonctionnement proposé

1. **Confirmation PDF** (fournisseur ou import manuel) : Cloudflare convertit le document en Markdown. BuildTrack reconnaît uniquement les tableaux dont les colonnes sont explicites (code, description, quantité, unité, prix unitaire, montant).
2. Les lignes reconnues sont affichées dans **Achats → Documents → Vérifier la commande**. L'administrateur corrige les quantités et prix, exclut les faux positifs et valide explicitement qu'il a vérifié le document original. Un montant incompatible avec quantité × prix est bloqué, non corrigé silencieusement.
3. Les lignes approuvées sont mises dans **Commandes** comme **brouillon**. Il faut toujours confirmer fournisseur, PO et nom du chantier indiqué à la livraison avant de créer l'engagement. Le PO ne détermine pas à lui seul le chantier.
4. Les documents reçus par courriel stockent les lignes détectées dans \`bt_purchase_documents.line_candidates\`. Le champ est protégé par la même RLS **administrateur/entreprise** que les autres informations financières. Aucune mutation des tables de commandes lors de l'extraction.
5. **Bon de livraison photographié** : lecture du PO et des colonnes \`Ordered / Shipped / B/O\`. Une action « Préremplir les quantités » permet de copier les propositions compatibles avec les articles du PO **uniquement si** le PO et le chantier concordent. La validation finale des quantités reçues reste une action administrateur distincte, sans prix.

### Comportements volontairement conservateurs
- Les colonnes doivent apparaître dans des tableaux Markdown reconnus ; les données de pages sans tableau sont signalées comme absentes.
- Les chiffres ambigus (par exemple « 1,000 ») sont invalides tant que l'administrateur ne les corrige pas.
- Les totaux, taxes, forfaits et sous-totaux ne sont pas des lignes matérielles.
- Une ligne sans référence, unité, quantité ou prix exploitable n'est jamais intégrée à l'engagement.
- Les sommes incohérentes bloquent la confirmation.
- Si un même code d'article apparaît sur plusieurs lignes de commande, aucune attribution de réception n'est proposée pour cet article.
- Le préremplissage des bons porte sur la **première photo** seulement ; les autres pages sont à examiner manuellement. Étendre l'analyse multipage seulement après une validation de coût et de qualité.
- Le code du document source, son fournisseur et son chantier doivent toujours être vérifiés. Le compteur BO est explicitement indiqué par le fournisseur, il n'est jamais déduit de la seule quantité non reçue.

## Vérifications automatiques
- \`npm run test:document-lines\` couvre formats FR/EN, prix, milliers ambigus, quantités livrées et BO, tableaux absents, seuils et revue humaine.
- Tests de correspondances de codes entre lignes OCR et commande (y compris codes répétés et quantités excessives).
- Fixture PostgreSQL 17 : le champ \`line_candidates\` ne devient visible ni aux employés ni à une autre entreprise.
- Le build Vite et les tests précédents ne doivent pas régresser.

## Restant avant la mise en production
Les PR #39 → #40 → #41 → #42 restent des PR empilées, **pas des modifications déployées**. La validation de la migration sur un Supabase réel, l'activation des secrets DNS/Email Routing Cloudflare, la réception réelle d'une commande PDF fournisseur, le fonctionnement iPhone du scanner et la confidentialité des anciens fichiers doivent être validés avant fusion.

Évaluer également la consommation des conversions photo/PDF avant de définir une limite mensuelle. Ne pas activer les appels IA payants sans l'accord de l'utilisateur. Les tests de cette PR utilisent uniquement des documents **synthétiques**, pas encore des confirmations fournisseurs réelles.
