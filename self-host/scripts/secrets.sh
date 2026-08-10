#!/bin/sh
# Print sensitive values operators commonly need (API keys, dashboard password).
#
# Usage:
#   sh secrets.sh [<project_dir>]
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

[ -f "$PROJECT/.env" ] || die "Missing $PROJECT/.env"

if [ -x "$PROJECT/run.sh" ]; then
  (
    cd "$PROJECT"
    sh run.sh secrets
  )
else
  # Fallback: print a subset.
  for key in ANON_KEY SERVICE_ROLE_KEY SUPABASE_PUBLISHABLE_KEY SUPABASE_SECRET_KEY \
             DASHBOARD_USERNAME DASHBOARD_PASSWORD POSTGRES_PASSWORD JWT_SECRET; do
    val=$(grep "^${key}=" "$PROJECT/.env" | head -n1 | cut -d= -f2- | tr -d "\r" || true)
    printf '%s=%s\n' "$key" "$val"
  done
fi
