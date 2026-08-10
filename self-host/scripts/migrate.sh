#!/bin/sh
# Apply assembled treq SQL migrations against the running Postgres container.
#
# Tracks applied versions in treq_internal.schema_migrations (created by the
# single-tenant 002 migration; bootstrapped here if missing).
#
# Usage:
#   sh migrate.sh [<project_dir>] [--migrations-dir <path>] [--dry-run]
#

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
# shellcheck source=./lib.sh
. "$SCRIPT_DIR/lib.sh"

PROJECT=""
MIG_DIR=""
DRY_RUN=0

while [ $# -gt 0 ]; do
  case "$1" in
    --migrations-dir) MIG_DIR=$2; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help)
      printf 'Usage: %s [<project_dir>] [--migrations-dir <path>] [--dry-run]\n' "$(basename "$0")"
      exit 0
      ;;
    *)
      if [ -z "$PROJECT" ]; then
        PROJECT=$1
        shift
      else
        die "Unexpected argument: $1"
      fi
      ;;
  esac
done

if [ -z "$PROJECT" ]; then
  PROJECT=$(resolve_project_dir)
else
  PROJECT=$(CDPATH= cd -- "$PROJECT" && pwd)
fi

if [ -z "$MIG_DIR" ]; then
  MIG_DIR="$PROJECT/treq/migrations"
fi
[ -d "$MIG_DIR" ] || die "Migrations directory not found: $MIG_DIR"

require_cmd docker

# Ensure tracking table exists even before 002 runs.
psql_in_db "$PROJECT" <<'SQL'
create schema if not exists treq_internal;
create table if not exists treq_internal.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
SQL

applied=0
skipped=0
for f in "$MIG_DIR"/*.sql; do
  [ -f "$f" ] || continue
  version=$(basename "$f" .sql)
  exists=$(psql_in_db "$PROJECT" -Atc \
    "select 1 from treq_internal.schema_migrations where version = '$version' limit 1;" || true)
  if [ "$exists" = "1" ]; then
    skipped=$((skipped + 1))
    continue
  fi

  log "Applying $version"
  if [ "$DRY_RUN" = "1" ]; then
    printf '  (dry-run) would apply %s\n' "$f"
    applied=$((applied + 1))
    continue
  fi

  psql_in_db "$PROJECT" -f - <"$f"
  psql_in_db "$PROJECT" -c \
    "insert into treq_internal.schema_migrations(version) values ('$version');"
  applied=$((applied + 1))
done

log "Migrations complete (applied=$applied skipped=$skipped dry_run=$DRY_RUN)"
