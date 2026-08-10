#!/bin/sh
# Bootstrap a single-tenant treq self-host install from this fat bundle.
#
# Materializes a deployment directory with:
#   - pinned Supabase Docker Compose stack (vendored)
#   - treq compose overlay, env keys, edge functions, SQL migrations
#   - generated secrets (via vendor utils)
#
# Usage:
#   sh bootstrap.sh [--project-dir <name>] [--repo-root <path>] [-y]
#                   [--skip-pull] [--start] [--public-url <url>] [--site-url <url>]
#
# After bootstrap:
#   cd <project-dir>
#   sh run.sh start
#   sh ../self-host/scripts/migrate.sh .   # if not auto-started with --start
#

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
BUNDLE_ROOT=$SCRIPT_DIR
# shellcheck source=./scripts/lib.sh
. "$BUNDLE_ROOT/scripts/lib.sh"

PROJECT_DIR="treq-selfhost"
REPO_ROOT=""
ASSUME_YES=0
SKIP_PULL=0
DO_START=0
PUBLIC_URL="http://localhost:8000"
SITE_URL="http://localhost:3001"

print_help() {
  cat <<EOF
Usage: bootstrap.sh [options]

Options:
  -p, --project-dir <name>   Deployment directory (default: treq-selfhost)
      --repo-root <path>     treq repo root (for migrations/functions)
      --public-url <url>     SUPABASE_PUBLIC_URL (default: http://localhost:8000)
      --site-url <url>       SITE_URL for auth redirects (default: http://localhost:3001)
      --skip-pull            Do not docker compose pull
      --start                Start stack and apply migrations after bootstrap
  -y, --yes                  Non-interactive defaults
  -h, --help                 Show help
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    -p|--project-dir) PROJECT_DIR=$2; shift 2 ;;
    --repo-root) REPO_ROOT=$2; shift 2 ;;
    --public-url) PUBLIC_URL=$2; shift 2 ;;
    --site-url) SITE_URL=$2; shift 2 ;;
    --skip-pull) SKIP_PULL=1; shift ;;
    --start) DO_START=1; shift ;;
    -y|--yes) ASSUME_YES=1; shift ;;
    -h|--help) print_help; exit 0 ;;
    *) die "Unknown option: $1" ;;
  esac
done

VENDOR="$BUNDLE_ROOT/vendor/supabase-docker"
[ -d "$VENDOR" ] && [ -f "$VENDOR/docker-compose.yml" ] || \
  die "Vendored supabase docker missing at $VENDOR (run pack.sh / refresh-vendor.sh)"

[ -f "$BUNDLE_ROOT/VERSION" ] || die "Missing VERSION"
[ -f "$BUNDLE_ROOT/SUPABASE_REF" ] || die "Missing SUPABASE_REF"
TREQ_VER=$(tr -d ' \n\r' <"$BUNDLE_ROOT/VERSION")
SUPA_REF=$(tr -d ' \n\r' <"$BUNDLE_ROOT/SUPABASE_REF")

if [ -e "$PROJECT_DIR" ] && [ "$ASSUME_YES" != "1" ]; then
  die "Project directory already exists: $PROJECT_DIR (pass -y to reuse only if empty)"
fi
if [ -e "$PROJECT_DIR" ]; then
  [ -z "$(ls -A "$PROJECT_DIR" 2>/dev/null || true)" ] || \
    die "Project directory is not empty: $PROJECT_DIR"
fi

mkdir -p "$PROJECT_DIR"
PROJECT_DIR=$(CDPATH= cd -- "$PROJECT_DIR" && pwd)

log "Materializing Supabase docker stack into $PROJECT_DIR"
cp -a "$VENDOR"/. "$PROJECT_DIR"/

# Stamp versions for upgrade tooling.
{
  printf 'ref=%s\n' "$SUPA_REF"
} >"$PROJECT_DIR/.supabase-version"
{
  printf 'treq_selfhost=%s\n' "$TREQ_VER"
  printf 'supabase_ref=%s\n' "$SUPA_REF"
  printf 'mode=single-tenant\n'
} >"$PROJECT_DIR/.treq-selfhost-version"

# Base env
cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env"

# treq overlay compose + env keys
cp "$BUNDLE_ROOT/overlay/docker-compose.treq.yml" "$PROJECT_DIR/docker-compose.treq.yml"
append_env_missing_keys "$BUNDLE_ROOT/overlay/env/treq.env.example" "$PROJECT_DIR/.env"
ensure_compose_override "$PROJECT_DIR" "docker-compose.treq.yml"

# Write URLs into .env
_tmp=$(mktemp)
awk -v pub="$PUBLIC_URL" -v api="$PUBLIC_URL/auth/v1" -v site="$SITE_URL" '
  BEGIN { done_pub=0; done_api=0; done_site=0 }
  /^SUPABASE_PUBLIC_URL=/ { print "SUPABASE_PUBLIC_URL=" pub; done_pub=1; next }
  /^API_EXTERNAL_URL=/ { print "API_EXTERNAL_URL=" api; done_api=1; next }
  /^SITE_URL=/ { print "SITE_URL=" site; done_site=1; next }
  { print }
  END {
    if (!done_pub) print "SUPABASE_PUBLIC_URL=" pub
    if (!done_api) print "API_EXTERNAL_URL=" api
    if (!done_site) print "SITE_URL=" site
  }
' "$PROJECT_DIR/.env" >"$_tmp"
mv "$_tmp" "$PROJECT_DIR/.env"

# Default redirect allow-list includes SITE_URL variants + desktop deep link.
redirects="${SITE_URL},${SITE_URL}/auth/callback,treq://auth/callback"
_tmp=$(mktemp)
awk -v r="$redirects" '
  BEGIN { done=0 }
  /^ADDITIONAL_REDIRECT_URLS=/ { print "ADDITIONAL_REDIRECT_URLS=" r; done=1; next }
  { print }
  END { if (!done) print "ADDITIONAL_REDIRECT_URLS=" r }
' "$PROJECT_DIR/.env" >"$_tmp"
mv "$_tmp" "$PROJECT_DIR/.env"

# Ensure vendor helper scripts are executable (git may not preserve +x).
chmod +x "$PROJECT_DIR"/run.sh "$PROJECT_DIR"/reset.sh \
  "$PROJECT_DIR"/update.sh "$PROJECT_DIR"/setup.sh \
  "$PROJECT_DIR"/utils/*.sh 2>/dev/null || true

# Generate secrets with vendor utils when available.
if [ -f "$PROJECT_DIR/utils/generate-keys.sh" ]; then
  log "Generating JWT / API keys"
  (
    cd "$PROJECT_DIR"
    sh utils/generate-keys.sh --update-env
  )
fi
if [ -f "$PROJECT_DIR/utils/add-new-auth-keys.sh" ]; then
  log "Adding asymmetric auth keys"
  (
    cd "$PROJECT_DIR"
    sh utils/add-new-auth-keys.sh --update-env
  )
fi

# Prefer frozen treq-assets when bootstrapping from a packed tarball.
if [ -z "$REPO_ROOT" ] && [ -d "$BUNDLE_ROOT/treq-assets/migrations" ]; then
  if [ ! -d "$BUNDLE_ROOT/../supabase/migrations" ]; then
    REPO_ROOT="$BUNDLE_ROOT/treq-assets"
  fi
fi

# Assemble migrations + sync functions
if [ -n "$REPO_ROOT" ]; then
  sh "$BUNDLE_ROOT/scripts/assemble-migrations.sh" \
    "$PROJECT_DIR/treq/migrations" --repo-root "$REPO_ROOT"
  sh "$BUNDLE_ROOT/scripts/sync-functions.sh" \
    "$PROJECT_DIR" --repo-root "$REPO_ROOT"
else
  sh "$BUNDLE_ROOT/scripts/assemble-migrations.sh" "$PROJECT_DIR/treq/migrations"
  sh "$BUNDLE_ROOT/scripts/sync-functions.sh" "$PROJECT_DIR"
fi

# Convenience wrappers inside the project
cat >"$PROJECT_DIR/treq-ops.sh" <<EOF
#!/bin/sh
# Dispatch common treq self-host ops. Bundle scripts live next to this install
# when bootstrapped from a checkout; override with TREQ_SELFHOST_BUNDLE.
set -eu
BUNDLE="\${TREQ_SELFHOST_BUNDLE:-$BUNDLE_ROOT}"
cmd=\${1:-status}
shift || true
export TREQ_SELFHOST_DIR="$PROJECT_DIR"
case "\$cmd" in
  status) sh "\$BUNDLE/scripts/status.sh" ;;
  secrets) sh "\$BUNDLE/scripts/secrets.sh" ;;
  migrate) sh "\$BUNDLE/scripts/migrate.sh" ;;
  backup) sh "\$BUNDLE/scripts/backup.sh" "\$@" ;;
  restore) sh "\$BUNDLE/scripts/restore.sh" "\$@" ;;
  sync-functions) sh "\$BUNDLE/scripts/sync-functions.sh" "$PROJECT_DIR" ;;
  upgrade) sh "\$BUNDLE/scripts/upgrade.sh" "\$@" ;;
  start) sh "$PROJECT_DIR/run.sh" start ;;
  stop) sh "$PROJECT_DIR/run.sh" stop ;;
  logs) sh "$PROJECT_DIR/run.sh" logs "\$@" ;;
  *)
    echo "Usage: \$0 {status|secrets|migrate|backup|restore|sync-functions|upgrade|start|stop|logs}" >&2
    exit 1
    ;;
esac
EOF
chmod +x "$PROJECT_DIR/treq-ops.sh"

if [ "$SKIP_PULL" != "1" ]; then
  require_cmd docker
  log "Pulling docker images"
  (
    cd "$PROJECT_DIR"
    docker_compose pull
  )
fi

if [ "$DO_START" = "1" ]; then
  require_cmd docker
  log "Starting stack"
  (
    cd "$PROJECT_DIR"
    sh run.sh start
  )
  log "Applying treq migrations"
  sh "$BUNDLE_ROOT/scripts/migrate.sh" "$PROJECT_DIR"
fi

cat <<EOF

Bootstrap complete.

  project:  $PROJECT_DIR
  treq:     $TREQ_VER
  supabase: $SUPA_REF
  mode:     single-tenant

Next:
  cd $PROJECT_DIR
  sh run.sh start
  sh treq-ops.sh migrate
  sh treq-ops.sh secrets

Point the treq desktop/web clients at SUPABASE_PUBLIC_URL and ANON_KEY from
"sh treq-ops.sh secrets". Configure GITHUB_APP_* in .env for merge queue.
EOF
