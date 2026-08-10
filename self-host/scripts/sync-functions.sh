#!/bin/sh
# Sync treq Edge Functions into a self-host project's volumes/functions.
# Preserves the vendor main/ router. Removes the sample hello/ function.
#
# Usage:
#   sh sync-functions.sh <project_dir> [--repo-root <path>]
#

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
# shellcheck source=./lib.sh
. "$SCRIPT_DIR/lib.sh"

PROJECT=""
REPO_ROOT=""

while [ $# -gt 0 ]; do
  case "$1" in
    --repo-root) REPO_ROOT=$2; shift 2 ;;
    -h|--help)
      printf 'Usage: %s <project_dir> [--repo-root <path>]\n' "$(basename "$0")"
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

[ -n "$PROJECT" ] || die "project_dir required"
PROJECT=$(CDPATH= cd -- "$PROJECT" && pwd)

BUNDLE_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
if [ -z "$REPO_ROOT" ]; then
  if [ -d "$BUNDLE_ROOT/../supabase/functions" ]; then
    REPO_ROOT=$(CDPATH= cd -- "$BUNDLE_ROOT/.." && pwd)
  elif [ -d "$BUNDLE_ROOT/treq-assets/functions" ]; then
    REPO_ROOT=$BUNDLE_ROOT/treq-assets
  else
    die "Cannot locate treq functions (pass --repo-root)"
  fi
fi

SRC="$REPO_ROOT/supabase/functions"
if [ ! -d "$SRC" ] && [ -d "$REPO_ROOT/functions" ]; then
  SRC="$REPO_ROOT/functions"
fi
[ -d "$SRC" ] || die "Functions not found under $REPO_ROOT"

DEST="$PROJECT/volumes/functions"
[ -d "$DEST/main" ] || die "Vendor main function missing at $DEST/main (is this a supabase docker install?)"

# Drop sample hello function if present.
rm -rf "$DEST/hello"

# Copy each treq function directory (skip _shared handled as part of copies).
for entry in "$SRC"/*; do
  [ -e "$entry" ] || continue
  name=$(basename "$entry")
  case "$name" in
    main) continue ;;
  esac
  rm -rf "$DEST/$name"
  cp -a "$entry" "$DEST/$name"
done

# _shared must be present for merge-queue helpers.
[ -d "$DEST/_shared" ] || die "Expected _shared helpers after sync"

log "Synced treq edge functions into $DEST"
ls -1 "$DEST"
