#!/usr/bin/env bash
set -Eeuo pipefail
# Local-only test of backup / restore workflow on fabricated CI database.
# NEVER pass a production DSN. The project database is deliberately restricted
# to this fixed test name.
: "${PGPASSWORD:?Required for local test database}"
host="${PGHOST:-127.0.0.1}"
port="${PGPORT:-5432}"
user="${PGUSER:-postgres}"
source_db="buildtrack_test"
target_db="buildtrack_restore_fixture"
args=(-h "$host" -p "$port" -U "$user")
if [[ "$host" != "127.0.0.1" && "$host" != "localhost" ]]; then
  echo "REFUSED: test backup/restore only runs against local database" >&2
  exit 3
fi
if ! command -v pg_dump >/dev/null || ! command -v pg_restore >/dev/null || ! command -v psql >/dev/null; then
  echo "PostgreSQL client tools are required" >&2
  exit 2
fi
umask 077
temp_dir="$(mktemp -d)"
trap 'rm -rf "$temp_dir"' EXIT
source_counts="$(psql "${args[@]}" -d "$source_db" -XAtqc 'SELECT (SELECT count(*) FROM public.companies)::text || \'/\' || (SELECT count(*) FROM public.tasks)::text || \'/\' || (SELECT count(*) FROM public.invites)::text || \'/\' || (SELECT count(*) FROM public.company_users)::text;')"
pg_dump "${args[@]}" -d "$source_db" --format=custom --no-owner --no-acl --schema=public --schema=auth --file="$temp_dir/fixture.dump"
pg_restore --list "$temp_dir/fixture.dump" >"$temp_dir/manifest.txt"
test -s "$temp_dir/manifest.txt"
if psql "${args[@]}" -d postgres -XAtqc "SELECT 1 FROM pg_database WHERE datname = '$target_db'" | grep -qx 1; then
  echo "REFUSED: restore target already exists" >&2
  exit 3
fi
createdb "${args[@]}" "$target_db"
# Restore always targets a separate local database, never the source.
pg_restore "${args[@]}" -d "$target_db" --exit-on-error --no-owner --no-acl "$temp_dir/fixture.dump"
restored_counts="$(psql "${args[@]}" -d "$target_db" -XAtqc 'SELECT (SELECT count(*) FROM public.companies)::text || \'/\' || (SELECT count(*) FROM public.tasks)::text || \'/\' || (SELECT count(*) FROM public.invites)::text || \'/\' || (SELECT count(*) FROM public.company_users)::text;')"
if [[ "$source_counts" != "$restored_counts" ]]; then
  echo "FAIL: fixture row counts do not match" >&2
  exit 1
fi
echo "PASS: isolated local dump & restore; fixture row counts match ($restored_counts)."
# The disposable test runner deletes its container at the end of the job.
# Do not delete the test database here: avoid unexpected destructive commands.
