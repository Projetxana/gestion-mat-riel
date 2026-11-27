# BuildTrack — rappels Web Push (préproduction)

## Périmètre
- Rappel journalier lundi–vendredi à 18 h locale; vendredi 19 h si au moins une journée attendue manque.
- Employés explicitement inscrits par l'administrateur et ayant autorisé les notifications sur leur appareil. Aucun envoi aux administrateurs ni aux membres retirés. Les absences sont des plages de dates inclusives sans motif médical.
- Les heures terminées (même en attente de validation) ou un pointage encore ouvert commencé ce jour suppressent le rappel. Le module ne présume pas qu'un employé a travaillé : la liste des employés attendus doit être tenue à jour. Aucun rattrapage avant inscription.
- Fuseaux canadiens configurables; DST géré par PostgreSQL. Fenêtre de 30 minutes, Cron toutes les cinq minutes. Historique par appareil et par type/date, conservé 90 jours. Un rappel quotidien et un rappel hebdomadaire sont distincts. Pas de retransmission automatique après une erreur ambiguë : éviter les doublons prime.
- Notification générique sans nom, société, chantier, heures, ni clés de chiffrement client. Un clic ouvre la saisie des heures via le même domaine. Acceptation par le fournisseur != livraison/lecture.
- Aucun service SMS, abonnement de notification ou numéro de téléphone. Les ressources Supabase/Cloudflare restent soumises à leurs quotas.

## État de sécurité par défaut
Le build normal conserve le service worker auto-destructeur existant. La fonctionnalité et le worker persistant sont activés uniquement par VITE_BUILDTRACK_PUSH_ENABLED=true au build. Aucune migration ni Cron de production ne doit être appliquée dans cette PR. Le serveur est indépendamment désactivé sauf BT_PUSH_SEND_ENABLED=true. Chaque entreprise doit ensuite activer ses rappels et sélectionner ses employés. Les endpoints sont des données personnelles: accessibles seulement au propriétaire et au dispatcher. L'administrateur voit un historique sans endpoint.

## Mise en place isolée (opérateur)
1. Créer une branche Supabase de test **sans données de production** (les branches persistantes peuvent être facturées). Ajouter deux entreprises fictives et des comptes de test; reproduire les fonctions et permissions actuelles. Utiliser un domaine de prévisualisation Cloudflare dédié et des variables Supabase de test, jamais une base de production.
2. Exécuter le SQL schema-PROPOSED.sql sur cette branche; vérifier les RLS et les advisors. Confirmer les tests PostgreSQL et le build avec fonctionnalité activée. Tester la concurrence de deux appels de claim; seul un doit réussir.
3. Générer une paire VAPID **dédiée au test** sur le poste opérateur (ne pas copier de clé privée dans Git, ChatGPT, le navigateur ou les logs):
   - npx --yes --package=web-push@3.6.7 web-push generate-vapid-keys --json
   - openssl rand -hex 32 (secret d'appel Cron).
   - Stocker BT_PUSH_VAPID_PUBLIC, BT_PUSH_VAPID_PRIVATE, BT_PUSH_VAPID_SUBJECT (mailto: adresse technique réelle), BT_PUSH_CRON_SECRET et BT_PUSH_SEND_ENABLED=false dans les secrets de la fonction.
   - Définir uniquement VITE_BUILDTRACK_PUSH_PUBLIC_KEY et VITE_BUILDTRACK_PUSH_ENABLED=true dans le build preview. Vérifier que la clé privée est absente du bundle.
4. Vérifier la compatibilité Deno, geler les dépendances transitives (deno.lock) et vérifier la fonction dans le runtime Supabase. La fonction utilise web-push avec un envoi sans payload pour éviter les problèmes d'interopérabilité du chiffrement. Déployer hour-reminders sur le projet de test avec vérification JWT gateway désactivée **uniquement** pour ce point d'entrée; son secret dédié est obligatoire. Tester POST sans secret/avec mauvais secret (401) et GET (405). Ne pas mettre de service role dans le navigateur ni dans Cron.
5. Configurer les deux secrets Vault (URL complète de la fonction de test et secret d'appel) et activer le Cron uniquement sur la branche de test. Autoriser BT_PUSH_SEND_ENABLED=true sur test. Dans Paramètres, inscrire un seul employé fictif attendu, régler temporairement le créneau près de l'heure courante et activer l'entreprise. Tester l'envoi depuis une requête Cron réelle et le refus d'un endpoint non autorisé.
6. **Test iPhone obligatoire**: iOS >=16.4, Safari > partager > Ajouter à l'écran d'accueil, ouvrir par l'icône, se connecter au compte fictif, Paramètres > Activer. Accepter la permission, fermer l'application/verrouiller l'écran, constater la notification puis vérifier son clic. Tester notification refusée, désactivation, déconnexion, compte différent, envoi unique, absence, heures saisies et rappel vendredi. Tester également mise à jour du worker et rechargement forcé sans perte de saisie, Safari et Android. Un test simulé ou un statut HTTP 201 n'est pas une preuve de réception.
7. Après validation documentée, sauvegarde de production, déploiement contrôlé des tables puis Edge Function avec kill switch désactivé. Générer de nouvelles clés de production et déployer le build activé. Tester d'abord avec un volontaire, puis autoriser l'entreprise et le Cron. Les clés ne doivent pas être réutilisées entre environnements.

## Annulation / incident
Désactiver BT_PUSH_SEND_ENABLED, désactiver les entreprises concernées, puis SELECT cron.unschedule('buildtrack-hour-reminders-v1');. Garder les données historiques jusqu'au terme de rétention; ne pas supprimer les tables en urgence. Si la fonctionnalité web doit être retirée, reconstruire avec le flag false (le worker historique s'auto-désinstallera). Les appareils devront se réabonner lors de la réactivation.
