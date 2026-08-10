#!/bin/sh
# Refresh self-host/vendor/supabase-docker from the pin in SUPABASE_REF
# (or --ref). Used by maintainers and by pack.sh.
#
# Usage:
#   sh refresh-vendor.sh [--ref <self-hosted/vX.Y.Z>]
#

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
BUNDLE_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
# shellcheck source=./lib.sh
. "$SCRIPT_DIR/lib.sh"

REF=""
while [ $# -gt 0 ]; do
  case "$1" in
    --ref) REF=$2; shift 2 ;;
    -h|--help)
      printf 'Usage: %s [--ref <tag>]\n' "$(basename "$0")"
      exit 0
      ;;
    *) die "Unknown option: $1" ;;
  esac
done

if [ -z "$REF" ]; then
  [ -f "$BUNDLE_ROOT/SUPABASE_REF" ] || die "Missing SUPABASE_REF"
  REF=$(tr -d ' \n\r' <"$BUNDLE_ROOT/SUPABASE_REF")
fi

require_cmd git

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

log "Cloning supabase@$REF (docker/ only)"
git clone --filter=blob:none --no-checkout --depth=1 --branch "$REF" \
  https://github.com/supabase/supabase "$TMP/src"
(
  cd "$TMP/src"
  git sparse-checkout init --cone
  git sparse-checkout set docker
  git checkout --quiet
)

DEST="$BUNDLE_ROOT/vendor/supabase-docker"
rm -rf "$DEST"
mkdir -p "$DEST"
cp -a "$TMP/src/docker"/. "$DEST"/
rm -rf "$DEST/dev" "$DEST/tests"
rm -f "$DEST/.env"

printf '%s\n' "$REF" >"$BUNDLE_ROOT/SUPABASE_REF"
chmod +x "$DEST"/*.sh "$DEST"/utils/*.sh 2>/dev/null || true
log "Vendored $REF into $DEST"
