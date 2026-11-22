# BuildTrack – pilote Achats, documents et bons (sans modification de production)

**Statut : PR en brouillon, fonctions non déployées, aucun Worker / DNS activé.** Cette étape dépend des PR #39 → #42. Les tests GitHub sont isolés et synthétiques.

## État vérifié le 22 novembre 2026

- Compte Supabase BuildTrack : deux projets actifs, ALTARA et Protection CD. Aucun projet de staging indépendant libre et aucune branche de développement payante autorisée.
- Tables `bt_purchase%` absentes de la base de production BuildTrack. Ne pas appliquer les migrations sur ce projet pour un premier essai.
- Service SMTP hérité `send-email` déployé, sans validation JWT à la passerelle : audit de l'autorisation requise avant d'étendre les flux. Ne pas remplacer cette fonction en production dans ce pilote.
- Aucun connecteur d'administration Cloudflare disponible dans cette session, donc configuration réelle des DNS, règles Email Routing et secrets impossible sans accès au tableau de bord.
- Conversion `env.AI.toMarkdown` corrigée pour utiliser **un tableau de fichiers**, conforme à l'API actuelle de Cloudflare. Aucune inférence réellement exécutée sur Cloudflare.
- Sortie SMTP du nouvel envoi de bons dirigée explicitement sur `smtp.gmail.com:465` TLS, et seulement pour un chantier autorisé, car Supabase hébergé bloque les ports sortants 25 et 587.

## Essai à zéro coût additionnel (automatique)

```bash
npm ci
npm run test:pilot
npm run test:documents
npm run test:document-lines
npm run test:deliveries
npm run build
```

Le pipeline GitHub `tenant-rls` teste aussi PostgreSQL 17 avec données fictives, RLS admin/employé/autre entreprise, migrations MVP1–MVP4 et restauration. Ce test ne prouve **pas** qu'Auth, PostgREST, Storage et Email Routing fonctionnent ensemble sur les services hébergés.

## Essai sur documents de référence (lecture locale, sans cloud)

Si les PDF fournis sont enregistrés sur le Mac, installer Poppler si nécessaire (`brew install poppler`), puis utiliser `pdftotext -layout "confirmation.pdf" -` et `pdftotext -layout "estimation.pdf" -`.

Points de contrôle réels à reproduire sans sauvegarder les données privées dans GitHub :
- Confirmation fournisseur : code produit (fournisseur/client), quantité commandée, quantité expédiée, quantité en souffrance, prix unitaire et montant net.
- Estimation : vérification de l'unité de prix `CT` (par 100) ou `LG` (longueur). Les catégories de frais et forfaits ne doivent pas entrer au budget matériel par défaut.
- **PO différent mais même chantier** : refus du rapprochement automatique.
- **BO sans livraison** : `ordered=100`, `shipped=0`, `supplier_bo_qty=100`, aucun engagement supplémentaire.

## Activation réelle — conditions impératives

1. **Environnement Supabase isolé** : projet de test indépendant ou instance locale Supabase Docker, avec Auth/Storage/Edge, comptes utilisateurs fictifs, entreprise test et chantier test. Vérifier les quatre migrations, appels PostgREST, lecture de documents privés et JWT avec un rôle non-admin. Ne pas tester sur ALTARA ou Protection CD avec des données de production.
2. **Infrastructure Cloudflare** : disposer d'un domaine/subdomaine de test routé sur Cloudflare ; activer Email Routing sur ce sous-domaine, le subaddressing, et router l'adresse `commandes@<sous-domaine-test>` vers un nouveau Worker (les suffixes `+token` sont visibles dans `message.to`). Ne pas modifier les MX du domaine BuildTrack principal. Faire `wrangler deploy --dry-run` avant tout déploiement réel.
3. **Garde-fous du Worker** : `ENABLE_INBOUND_EMAIL=true` seulement en test, `PILOT_ALLOWED_SENDERS` = adresses tests autorisées, `INBOUND_DOMAIN` = sous-domaine test, `INGEST_URL` vers l'Edge Function de test, `INGEST_SECRET` long et aléatoire. `ENABLE_DOCUMENT_AI=false` jusqu'à autorisation du budget et test de la qualité OCR.
4. **Garde-fous Supabase Edge** : `DOCUMENT_INBOUND_ENABLED=true`, `PILOT_COMPANY_ID` et `PILOT_SITE_ID` identifiants fictifs de test. `DOCUMENT_INGEST_SECRET` = secret Worker, `DOCUMENT_INBOUND_DOMAIN` = sous-domaine test, `DOCUMENT_WORKER_URL` = URL privée du Worker. Pour les bons, `DELIVERY_PILOT_ENABLED=true` uniquement après confirmation du destinataire de test, `DELIVERY_ACCOUNTING_EMAIL` = boîte test, SMTP_USER/PASS en secret côté serveur.
5. **Scénarios d'acceptation** : un vrai PDF fournisseur de test avec domaine et adresse du chantier test ; un courriel mal authentifié ; un mauvais alias ; un PO du mauvais chantier ; double envoi identique ; bon de livraison en deux expéditions ; BO fournisseur ; compte employé révoqué ; PDF scanné sans texte ; dépassement des quantités commandées ; e-mail ambigu après erreur réseau.
6. **Budget et protection** : valider le coût Cloudflare Workers AI par page/image, une limite de consommation, la durée de rétention des scans, le responsable comptable et les transferts de données. Prévoir un arrêt d'urgence en désactivant la règle Email Routing.

## Critères GO/NO-GO

**GO vers un chantier pilote réel uniquement si** : tests Auth/Storage/Edge réels satisfaisants, envoi et réception d'un courriel test confirmés, destination comptabilité verrouillée, isolation des employés validée, double envoi refusé, exactitude OCR mesurée sur fichiers test, plafond de dépenses accepté, plan de rollback vérifié.

**NO-GO actuellement :** aucun environnement d'exécution Supabase distinct, aucune configuration Cloudflare connectée, aucun test SMTP/Workers AI réel. Ne pas confondre un déploiement *preview* Cloudflare Pages avec l'activation d'un Email Worker ou des migrations Supabase.

## Principaux fichiers
- `workers/buildtrack-documents/index.js` et `wrangler.toml`
- `supabase/functions/bt-ingest-purchase-mail/index.ts`
- `supabase/functions/bt-analyze-purchase-document/index.ts`
- `supabase/functions/bt-send-delivery-note/index.ts`
- `tests/purchase-pilot-flow.test.mjs` et `tests/pilot-safety.test.mjs`
