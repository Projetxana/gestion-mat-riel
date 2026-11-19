# BuildTrack — production backup and recovery gate (2026-11-18)
Status: **BACKUP OF PRODUCTION NOT YET VERIFIED**. The GitHub Actions fixture restore drill is green, but it does **not** protect the live data.

## Authoritative target
- Supabase project: `hxjkhkpgacaioghcanhp` (Protection CD Gestion Matériel), PostgreSQL 17.11, ca-central-1.
- Application: `https://app.buildtrackapp.ca`, Vercel project `gestion-mat-riel`, production branch `main`.
- Use the project-specific connection URI from **Supabase Dashboard → BuildTrack → Connect → Session pooler**. Never share the DB password or complete URI in chat, GitHub, Slack, screenshots, or CI logs.
- Observed (read-only): three tenant companies, 24 memberships, eleven sites, 35 historical tasks, 91 project_tasks and eight time_sessions; the database reports about 15 MB. Counts can change in normal operation.

## Verified so far
- GitHub Actions `BuildTrack Security Tests` successfully backs up and restores a **fabricated**, isolated PostgreSQL 17 database into a distinct throwaway database using `pg_dump` / `pg_restore`, checking four table row counts.
- Scoped role tests in the isolated fixture cover member/admin/anon, tenant separation, and secure invitation acceptance/replay.
- Live production **read-only** checks confirmed current RLS exposure and reference consistency. These do not constitute a restore test or JWT/PostgREST end-to-end test.

## Required production backup (manual, local, no production changes)
Supabase Free does not provide downloadable automatic daily backups. Supabase recommends exporting a logical backup with the CLI. The CLI v3 may prompt before remote operations; this procedure is read-only.

1. Install Docker Desktop and the Supabase CLI on a trusted Mac. Check `supabase --version` and `supabase db dump --help`.
2. Create/use a **private encrypted external volume**, outside any Git repository, cloud-synced or shared folder.
3. Set the backup directory in Terminal:
   ```bash
   export BUILDTRACK_BACKUP_DIR="/Volumes/YOUR_ENCRYPTED_VOLUME/BuildTrack-Backups"
   bash scripts/backup-buildtrack-prod.sh
   ```
4. When prompted, paste the complete **BuildTrack** Session pooler URI from Supabase → Connect. This hidden input is used only on the local Mac, never stored in the repository.
5. The script refuses connection strings that do not contain `hxjkhkpgacaioghcanhp`, exports `roles.sql`, `schema.sql`, `data.sql`, verifies their non-empty sizes and SHA-256 checksums, and keeps permissions restricted to the local owner.
6. Keep an additional encrypted, offline copy. Supabase logical SQL backups can contain personal data and password hashes, so do **not** commit or upload them to a public/private source repository.

**Do not treat a successful dump as proof of restorability.** Storage API object *bytes* are not included in PostgreSQL backups; plan a separate storage backup if used.

## Actual restore rehearsal (manual, isolated local Supabase)
Follow the current official Supabase [Backup and Restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) and [Automated backups — Check that the backup restores](https://supabase.com/docs/guides/deployment/ci/backups) documentation.

Example when `roles.sql`, `schema.sql`, `data.sql` exist in a secure local backup folder and the installed CLI supports `--workdir`:

```bash
# Pick a fresh throwaway folder; no connection to hosted project here.
mkdir -p /tmp/buildtrack-restore-rehearsal
supabase init --workdir /tmp/buildtrack-restore-rehearsal
supabase db start --workdir /tmp/buildtrack-restore-rehearsal
cd /Volumes/YOUR_ENCRYPTED_VOLUME/BuildTrack-Backups/buildtrack-YYYYMMDDTHHMMSSZ
shasum -a 256 -c SHA256SUMS
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file roles.sql --file schema.sql \
  --command 'SET session_replication_role = replica' --file data.sql \
  --dbname 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
```

This verification must complete with exit code zero; then compare counts for `public.companies`, `company_users`, `sites`, `tasks`, `project_tasks`, `time_sessions` on **local** restored DB against the snapshot immediately before export. Test local read-only queries for `collective_hours_progress` metadata and `pg_policies`. For application-level restoration, check Auth users, Edge Functions and Storage separately; database-only restore is not a full platform clone.

Do not blindly restore to the hosted production project; a real production restore can cause downtime, overwrite newer user data and require service-specific setup.

## Final integration gates (must be witnessed before production mutation)
- [x] Isolated PostgreSQL 17 policy and invitation tests.
- [x] Isolated **fabricated-data** dump/restore drill.
- [x] Production read-only baseline / RLS grants / reference consistency.
- [x] Inspected deployed Edge Function `buildtrack-invite-user` v5. It checks tenant admin membership and invites with Supabase Auth; it is distinct from the legacy public `invites` table.
- [ ] Actual production dump successfully created and independently restore-rehearsed; record checksum + timestamp (not sensitive contents).
- [ ] End-to-end invitation, activation, login, reset password, member/admin access using test accounts in a disposable full Supabase stack, including REST and Realtime.
- [ ] Resolve the legacy `create_company_user` password-storage vulnerability (GitHub issue #9).
- [ ] Production change window, verified nonsecret restore instructions, verified frontend rollback target.
- [ ] After backup validation, apply vetted SQL migrations in correct order **before** shipping frontend that references `bt_accept_invite_secure`.
- [ ] Merge/promote to `main` only after gates pass, as Vercel production branch is `main`.

**No schema migration, backup restore, or merge into `main` is authorized by this document.**
