# BuildTrack MVP3 — PDF, courriels de commande et documents privés

**État : PR #41 de développement, non déployée, aucune consommation OCR activée.**
Cette PR se base sur #40 (Bons / BO), elle-même basée sur #39 (budget/PO).

## Parcours prévu

### Confirmation de commande fournisseur
1. Administrateur ouvre un chantier actif → Achats → Documents → « Générer l'adresse ».
2. L'adresse générée est de la forme `commandes+<32-char-token>@achats.buildtrackapp.ca`. Ce n'est **pas** une adresse active avant le routage Cloudflare.
3. Un fournisseur envoie/transfère un courriel avec une confirmation PDF/JPEG/PNG/WebP ; Cloudflare Email Routing, avec sous-adressage activé, livre à `workers/buildtrack-documents/index.js`.
4. Le Worker vérifie DMARC déclaré par Cloudflare, la forme de l'alias, la taille du courriel, puis signe et transmet les octets MIME exacts à l'Edge Function Supabase `bt-ingest-purchase-mail`. Le Worker ne reçoit **aucune clé service_role** Supabase.
5. L'Edge vérifie HMAC avec horodatage, résout l'alias en chantier actif, parse le MIME (`postal-mime@4.2.1`), sélectionne les pièces jointes prises en charge, et stocke dans `bt-purchase-private`. L'empreinte SHA256 prévient les doubles traitements d'une même pièce sur le même chantier.
6. L'Edge peut demander au Worker `/internal/extract` une conversion PDF/photo via `AI.toMarkdown` (uniquement si `ENABLE_DOCUMENT_AI=true` et après validation des coûts). Le texte et les indices PO/chantier sont enregistrés en **pending_review**.
7. L'administrateur peut consulter l'original avec un lien signé valable 60 secondes, comparer nom du chantier, fournisseur, lignes, prix et quantités et seulement ensuite créer une commande budgétaire à l'aide du flux MVP1.
8. Un PO est identifiant de **commande**, pas de **chantier** ; l'adresse de livraison doit être cohérente avec la fiche chantier ou faire l'objet d'une confirmation administrative.

### Scan de bon de livraison
1. L'employé choisit le chantier, photographie le bon.
2. Les photos vont dans `bt-delivery-private` sous `<company>/<site>/<auth-user>/<UUID>`.
3. Seule l'Edge Function `bt-send-delivery-note` vérifie le jeton Auth et l'association de l'employé à ce chantier, télécharge les photos privées, et expédie à **l'adresse comptable définie côté serveur**.
4. Réservation anti-doublon par empreinte d'images **avant** SMTP ; états `sending`, `send_failed`, `pending_review`, `verified`. Si la réponse après SMTP est incertaine, on n'envoie pas de nouveau courriel automatiquement.
5. L'administrateur voit les bons à examiner, peut ouvrir une photo privée et demander une proposition de PO via l'analyse IA. Les quantités reçues/BO restent validées dans la transaction MVP2, sans modifier les achats engagés.

**Aucune facture comptable n'est créée ou traitée.**

## Configuration (à faire avant le premier essai réel)

- Revoir puis appliquer, dans l'ordre, les migrations proposées `bt_purchases_mvp1_PROPOSED.sql`, `bt_purchases_mvp2_PROPOSED.sql`, `bt_purchases_mvp3_PROPOSED.sql`, après tests supplémentaires dans une base jetable ; aucune n'est appliquée par une fusion GitHub.
- Déployer les Edge Functions :
  - `bt-ingest-purchase-mail` sans `verify_jwt` (l'authentification est remplacée par HMAC partagé à octets exacts ; pas d'autre route publique non signée).
  - `bt-analyze-purchase-document` et `bt-send-delivery-note` **avec** `verify_jwt` / session Supabase valide.
- Secrets Supabase côté Edge : `DOCUMENT_INGEST_SECRET` (32+ octets aléatoires), `DOCUMENT_WORKER_URL`, `DOCUMENT_INBOUND_DOMAIN`, `SMTP_USER`, `SMTP_PASS`, `DELIVERY_ACCOUNTING_EMAIL`. `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` restent **uniquement** dans le runtime serveur et jamais dans Vite.
- Variables Worker Cloudflare : `INGEST_URL` (Edge `bt-ingest-purchase-mail`), `INBOUND_DOMAIN` (`achats.buildtrackapp.ca`), secret `INGEST_SECRET` identique à `DOCUMENT_INGEST_SECRET`, binding `AI`. `ENABLE_DOCUMENT_AI` reste `false` tant que budget/performances non validés.
- Activer Email Routing pour le sous-domaine contrôlé, le sous-adressage `+`, et la règle `commandes` pointant sur le Worker. Vérifier DKIM/SPF/DMARC et la chaîne de transfert. Ne pas perturber le MX du domaine principal.
- Déployer l'UI seulement après les migrations et secrets, puis faire un essai réel depuis un **compte test**, une adresse fournisseur de test et un chantier test, avec un document anonymisé.

## Facturation / limites

`AI.toMarkdown` convertit les PDF texte et les images. Les images utilisent des modèles Workers AI et peuvent générer des frais au-delà des allocations ; ne pas activer sans validation du budget. Les PDF scannés (sans couche de texte) ne sont pas garantis lisibles par la conversion PDF : évaluer un rendu image/OCR complémentaire en essais réels.

L'extraction OCR est **non fiable pour les quantités et montants critiques**. Elle ne doit jamais écrire directement une commande, une réception, un prix ou un BO. Le MVP3 ne parse que des indices de PO/chantier et un extrait textuel. La saisie des lignes d'achat reste Excel/CSV et validation humaine.

## Sécurité : points encore bloquants pour la production

- Le bucket hérité `delivery-notes` et l'ancienne fonction `send-email` sont encore utilisés par d'autres parcours et ont des risques de liens publics/destinataires choisis par le client. **Audit, remplacement compatible et migration des anciens bons avant diffusion générale**.
- Les migrations proposées et les règles Storage doivent être vérifiées **dans un vrai environnement Supabase** (Auth, PostgREST, Edge, Storage) et pas seulement Postgres 17 ; Supabase Branching n'est pas accessible sur le plan actuel.
- Limiter/mesurer le volume des courriels et des conversions IA (circuit breaker, quotas par entreprise, anti-spam, tentatives de rejouer l'HMAC).
- Évaluer la politique de rétention des scans et documents (Québec, RGPD), l'effacement, les traces d'accès et les sous-traitants de traitement de données.
- Tester : mauvaises adresses/entreprises, pièce corrompue/cryptée, PDF sans texte, scan hors ligne, deux photos du même bon, courriels MIME avec signature/logo, livraison comptable réussie mais réponse réseau interrompue, révoquer un employé, doublon de PO, erreur d'OCR.

## Tests CI
- `tests/purchase-document-text.test.mjs`
- `tests/document-worker.test.mjs` (Worker mocké : aucune IA appelée)
- `tests/purchases-documents-postgres.sql` sur Postgres 17 jetable
- `npm run build` (tests Achats + Livraisons + Documents)
