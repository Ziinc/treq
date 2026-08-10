#!/bin/sh
# Build a distributable fat bundle tarball for offline/self-host installs.
#
# Includes:
#   - vendored Supabase docker compose stack (pinned)
#   - treq overlay (compose, env, single-tenant migration)
#   - frozen copies of treq migrations + edge functions
#   - bootstrap + ops scripts
#
# Usage:
#   sh pack.sh [--out <dir>] [--skip-refresh]
#
# Output:
#   <out>/treq-selfhost-<version>.tar.gz
#

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
BUNDLE_ROOT=$SCRIPT_DIR
# shellcheck source=./scripts/lib.sh
. "$BUNDLE_ROOT/scripts/lib.sh"

OUT_DIR="$BUNDLE_ROOT/dist"
SKIP_REFRESH=0
REPO_ROOT=$(CDPATH= cd -- "$BUNDLE_ROOT/.." && pwd)

while [ $# -gt 0 ]; do
  case "$1" in
    --out) OUT_DIR=$2; shift 2 ;;
    --skip-refresh) SKIP_REFRESH=1; shift ;;
    --repo-root) REPO_ROOT=$2; shift 2 ;;
    -h|--help)
      printf 'Usage: %s [--out <dir>] [--skip-refresh] [--repo-root <path>]\n' "$(basename "$0")"
      exit 0
      ;;
    *) die "Unknown option: $1" ;;
  esac
done

[ -f "$BUNDLE_ROOT/VERSION" ] || die "Missing VERSION"
VERSION=$(tr -d ' \n\r' <"$BUNDLE_ROOT/VERSION")
NAME="treq-selfhost-$VERSION"

if [ "$SKIP_REFRESH" != "1" ]; then
  sh "$BUNDLE_ROOT/scripts/refresh-vendor.sh"
fi
[ -f "$BUNDLE_ROOT/vendor/supabase-docker/docker-compose.yml" ] || \
  die "Vendor missing; run scripts/refresh-vendor.sh"

STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
ROOT="$STAGE/$NAME"
mkdir -p "$ROOT"

log "Staging fat bundle $NAME"
cp "$BUNDLE_ROOT/VERSION" "$ROOT/VERSION"
cp "$BUNDLE_ROOT/SUPABASE_REF" "$ROOT/SUPABASE_REF"
cp "$BUNDLE_ROOT/bootstrap.sh" "$ROOT/bootstrap.sh"
cp "$BUNDLE_ROOT/pack.sh" "$ROOT/pack.sh" 2>/dev/null || true
cp "$BUNDLE_ROOT/README.md" "$ROOT/README.md"

mkdir -p "$ROOT/scripts" "$ROOT/overlay" "$ROOT/vendor" "$ROOT/treq-assets"
cp -a "$BUNDLE_ROOT/scripts"/. "$ROOT/scripts"/
cp -a "$BUNDLE_ROOT/overlay"/. "$ROOT/overlay"/
cp -a "$BUNDLE_ROOT/vendor/supabase-docker" "$ROOT/vendor/supabase-docker"

# Freeze migrations (single-tenant assembled) + functions into treq-assets so
# the tarball does not require a full treq git checkout on the server.
sh "$BUNDLE_ROOT/scripts/assemble-migrations.sh" \
  "$ROOT/treq-assets/migrations" --repo-root "$REPO_ROOT"
mkdir -p "$ROOT/treq-assets/functions"
cp -a "$REPO_ROOT/supabase/functions"/. "$ROOT/treq-assets/functions"/

# Point assemble/sync defaults: when supabase/ is absent, use treq-assets/.
# Already handled in those scripts via treq-assets fallback when repo layout
# is the bundle root itself. Ensure bootstrap finds assets by setting
# a marker and copying a tiny shim:
printf 'single-tenant\n' >"$ROOT/treq-assets/MODE"

chmod +x "$ROOT/bootstrap.sh" "$ROOT/scripts"/*.sh

mkdir -p "$OUT_DIR"
OUT_DIR=$(CDPATH= cd -- "$OUT_DIR" && pwd)
TAR="$OUT_DIR/$NAME.tar.gz"

tar -C "$STAGE" -czf "$TAR" "$NAME"
log "Wrote $TAR"
# shellcheck disable=SC2012
ls -lh "$TAR"
