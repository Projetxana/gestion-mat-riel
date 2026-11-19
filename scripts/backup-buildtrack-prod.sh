#!/usr/bin/env bash
set -Eeuo pipefail
# Creates a LOCAL, private backup of BuildTrack. No commits/uploads.
# Usage: BUILDTRACK_BACKUP_DIR=/absolute/path/on/encrypted-volume bash scripts/backup-buildtrack-prod.sh
# Prerequisites: installed Supabase CLI, Docker Desktop, and the Supabase
# session-pooler (or direct) database connection string from Project > Connect.
PROJECT_REF="hxjkhkpgacaioghcanhp"
: "${BUILDTRACK_BACKUP_DIR:?Specify an absolute path on a private encrypted local drive}"
case "$BUILDTRACK_BACKUP_DIR" in
  /*) ;;
  *) echo "Refusing non-absolute backup directory" >&2; exit 2;;
esac
case "$BUILDTRACK_BACKUP_DIR" in
  *gestion-mat-riel*|*/tmp/*|*/public/*|*/Public/*)
    echo "Backup directory could be inside source control or insecure temporary/public storage" >&2; exit 2;;
esac
command -v supabase >/dev/null || { echo "Supabase CLI not installed" >&2; exit 2; }
command -v shasum >/dev/null || { echo "shasum not installed" >&2; exit 2; }
umask 077
printf 'Paste the FULL BuildTrack database URI from Supabase > Connect (input hidden): '
IFS= read -rs SUPABASE_DB_URL
printf '\n'
if [[ "$SUPABASE_DB_URL" != postgresql://* && "$SUPABASE_DB_URL" != postgres://* ]]; then
  echo "Refusing invalid database URI" >&2; exit 2
fi
if [[ "$SUPABASE_DB_URL" != *"$PROJECT_REF"* ]]; then
  echo "REFUSED: the database URI does not contain the expected BuildTrack project reference" >&2; exit 3
fi
mkdir -p "$BUILDTRACK_BACKUP_DIR"
chmod 700 "$BUILDTRACK_BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
output="$BUILDTRACK_BACKUP_DIR/buildtrack-$stamp"
if [[ -e "$output" ]]; then echo "Refusing to overwrite an existing backup" >&2; exit 4; fi
mkdir -m 700 "$output"
cleanup() {
  unset SUPABASE_DB_URL
  if [[ "${completed:-no}" != "yes" ]]; then
    echo "INCOMPLETE backup: removing partial files" >&2
    rm -f "$output/roles.sql" "$output/schema.sql" "$output/data.sql" "$output/SHA256SUMS"
    rmdir "$output" 2>/dev/null || :
  fi
}
trap cleanup EXIT
# The following flags follow Supabase's documented manual backup procedure.
# Do not upload the SQL files to GitHub, Cloudflare, or an unencrypted shared disk.
supabase db dump --remote="$SUPABASE_DB_URL" -f "$output/roles.sql" --role-only
supabase db dump --remote="$SUPABASE_DB_URL" -f "$output/schema.sql"
supabase db dump --remote="$SUPABASE_DB_URL" -f "$output/data.sql" --use-copy --data-only -x storage.buckets_vectors -x storage.vector_indexes
for file in roles.sql schema.sql data.sql; do
  test -s "$output/$file" || { echo "Empty backup part: $file" >&2; exit 5; }
done
(cd "$output" && shasum -a 256 roles.sql schema.sql data.sql > SHA256SUMS && shasum -a 256 -c SHA256SUMS)
chmod 600 "$output"/*
completed=yes
echo "Backup files created locally in $output"
echo "NOT RESTORE-VERIFIED yet: follow docs/collective-hours/production-backup-and-recovery.md"
echo "Remember: PostgreSQL backup includes sensitive profiles/credentials and does not back up Storage objects themselves."
