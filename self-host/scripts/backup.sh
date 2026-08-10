#!/bin/sh
# Backup Postgres data from a running treq self-host install.
#
# Usage:
#   sh backup.sh [<project_dir>] [--out <file.sql.gz>]
#

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
# shellcheck source=./lib.sh
. "$SCRIPT_DIR/lib.sh"

PROJECT=""
OUT=""

while [ $# -gt 0 ]; do
  case "$1" in
    --out) OUT=$2; shift 2 ;;
    -h|--help)
      printf 'Usage: %s [<project_dir>] [--out <file.sql.gz>]\n' "$(basename "$0")"
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

require_cmd docker
require_cmd gzip

stamp=$(date -u +%Y%m%dT%H%M%SZ)
if [ -z "$OUT" ]; then
  mkdir -p "$PROJECT/backups"
  OUT="$PROJECT/backups/treq-postgres-$stamp.sql.gz"
fi

log "Writing backup to $OUT"
(
  cd "$PROJECT"
  docker_compose exec -T db pg_dump -U postgres --clean --if-exists --exclude-schema=extensions \
    | gzip -c >"$OUT"
)

# Also snapshot .env (secrets) beside the dump for disaster recovery.
cp "$PROJECT/.env" "${OUT%.sql.gz}.env"
printf '%s\n' "$OUT"
log "Backup complete"
