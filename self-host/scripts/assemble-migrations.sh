#!/bin/sh
# Assemble the single-tenant migration set into a destination directory.
#
# Copies numbered migrations from the treq supabase/migrations tree, but
# replaces 002_stripe_fdw.sql with the single-tenant subscriptions migration.
#
# Usage:
#   sh assemble-migrations.sh <dest_dir> [--repo-root <path>]
#

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
# shellcheck source=./lib.sh
. "$SCRIPT_DIR/lib.sh"

DEST=""
REPO_ROOT=""

while [ $# -gt 0 ]; do
  case "$1" in
    --repo-root) REPO_ROOT=$2; shift 2 ;;
    -h|--help)
      printf 'Usage: %s <dest_dir> [--repo-root <path>]\n' "$(basename "$0")"
      exit 0
      ;;
    *)
      if [ -z "$DEST" ]; then
        DEST=$1
        shift
      else
        die "Unexpected argument: $1"
      fi
      ;;
  esac
done

[ -n "$DEST" ] || die "dest_dir required"

BUNDLE_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
if [ -z "$REPO_ROOT" ]; then
  # Prefer sibling supabase/ when developing inside the treq repo.
  if [ -d "$BUNDLE_ROOT/../supabase/migrations" ]; then
    REPO_ROOT=$(CDPATH= cd -- "$BUNDLE_ROOT/.." && pwd)
  elif [ -d "$BUNDLE_ROOT/treq-assets/migrations" ]; then
    REPO_ROOT=$BUNDLE_ROOT/treq-assets
  else
    die "Cannot locate treq migrations (pass --repo-root)"
  fi
fi

SRC_MIG="$REPO_ROOT/supabase/migrations"
if [ ! -d "$SRC_MIG" ] && [ -d "$REPO_ROOT/migrations" ]; then
  SRC_MIG="$REPO_ROOT/migrations"
fi
[ -d "$SRC_MIG" ] || die "Migrations not found under $REPO_ROOT"

OVERLAY="$BUNDLE_ROOT/overlay/migrations/002_single_tenant_subscriptions.sql"
[ -f "$OVERLAY" ] || die "Missing single-tenant overlay: $OVERLAY"

mkdir -p "$DEST"
# Clear previous assembled set (destination should be owned by this tool).
find "$DEST" -maxdepth 1 -type f -name '*.sql' -delete

copied=0
for f in "$SRC_MIG"/*.sql; do
  [ -f "$f" ] || continue
  base=$(basename "$f")
  case "$base" in
    002_stripe_fdw.sql)
      cp "$OVERLAY" "$DEST/002_single_tenant_subscriptions.sql"
      copied=$((copied + 1))
      ;;
    *)
      cp "$f" "$DEST/$base"
      copied=$((copied + 1))
      ;;
  esac
done

[ "$copied" -gt 0 ] || die "No migrations copied from $SRC_MIG"
# Ensure overlay exists even if upstream dropped 002.
if [ ! -f "$DEST/002_single_tenant_subscriptions.sql" ]; then
  cp "$OVERLAY" "$DEST/002_single_tenant_subscriptions.sql"
fi

log "Assembled $copied migration files into $DEST"
ls -1 "$DEST"
