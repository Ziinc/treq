#!/bin/sh
# Restore a Postgres dump produced by backup.sh into the running stack.
#
# WARNING: replaces database contents. Stop writers first if needed.
#
# Usage:
#   sh restore.sh <file.sql.gz> [<project_dir>]
#

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
# shellcheck source=./lib.sh
. "$SCRIPT_DIR/lib.sh"

DUMP=""
PROJECT=""

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help)
      printf 'Usage: %s <file.sql.gz> [<project_dir>]\n' "$(basename "$0")"
      exit 0
      ;;
    *)
      if [ -z "$DUMP" ]; then
        DUMP=$1
        shift
      elif [ -z "$PROJECT" ]; then
        PROJECT=$1
        shift
      else
        die "Unexpected argument: $1"
      fi
      ;;
  esac
done

[ -n "$DUMP" ] || die "dump file required"
[ -f "$DUMP" ] || die "dump not found: $DUMP"

if [ -z "$PROJECT" ]; then
  PROJECT=$(resolve_project_dir)
else
  PROJECT=$(CDPATH= cd -- "$PROJECT" && pwd)
fi

require_cmd docker
require_cmd gzip

log "Restoring $DUMP into $PROJECT"
gzip -dc "$DUMP" | (
  cd "$PROJECT"
  docker_compose exec -T db psql -U postgres -v ON_ERROR_STOP=1
)

log "Restore complete"
