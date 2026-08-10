#!/bin/sh
# Show stack status, treq migration stamp, and key public endpoints.
#
# Usage:
#   sh status.sh [<project_dir>]
#

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
# shellcheck source=./lib.sh
. "$SCRIPT_DIR/lib.sh"

PROJECT="${1:-}"
if [ -z "$PROJECT" ]; then
  PROJECT=$(resolve_project_dir)
else
  PROJECT=$(CDPATH= cd -- "$PROJECT" && pwd)
fi

require_cmd docker

printf 'project: %s\n' "$PROJECT"
if [ -f "$PROJECT/.treq-selfhost-version" ]; then
  printf 'treq stamp:\n'
  sed 's/^/  /' "$PROJECT/.treq-selfhost-version"
fi
if [ -f "$PROJECT/.supabase-version" ]; then
  printf 'supabase stamp:\n'
  sed 's/^/  /' "$PROJECT/.supabase-version"
fi

printf '\ncompose:\n'
(
  cd "$PROJECT"
  docker_compose ps
) || true

if [ -f "$PROJECT/.env" ]; then
  public_url=$(grep '^SUPABASE_PUBLIC_URL=' "$PROJECT/.env" | head -n1 | cut -d= -f2- | tr -d "\r\"'")
  site_url=$(grep '^SITE_URL=' "$PROJECT/.env" | head -n1 | cut -d= -f2- | tr -d "\r\"'" || true)
  anon=$(grep '^ANON_KEY=' "$PROJECT/.env" | head -n1 | cut -d= -f2- | tr -d "\r\"'")
  printf '\nendpoints:\n'
  printf '  SUPABASE_PUBLIC_URL=%s\n' "$public_url"
  printf '  SITE_URL=%s\n' "${site_url:-}"
  printf '  ANON_KEY (prefix)=%s...\n' "$(printf '%s' "$anon" | cut -c1-24)"
fi

printf '\nmigrations:\n'
psql_in_db "$PROJECT" -Atc \
  "select version || ' @ ' || applied_at from treq_internal.schema_migrations order by applied_at;" \
  2>/dev/null | sed 's/^/  /' || printf '  (unavailable — is the stack up?)\n'
