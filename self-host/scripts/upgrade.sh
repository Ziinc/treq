#!/bin/sh
# Upgrade a treq self-host install:
#   1. Optional DB backup
#   2. Refresh Supabase vendor files (via update.sh or bundled refresh)
#   3. Re-apply treq overlay (compose, env keys, functions, migrations)
#   4. Pull images + recreate
#   5. Apply pending treq SQL migrations
#
# Usage:
#   sh upgrade.sh [<project_dir>] [--to <supabase-ref>] [--skip-backup] [-y]
#                 [--repo-root <path>] [--dry-run]
#

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
BUNDLE_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
# shellcheck source=./lib.sh
. "$SCRIPT_DIR/lib.sh"

PROJECT=""
TO_REF=""
SKIP_BACKUP=0
ASSUME_YES=0
DRY_RUN=0
REPO_ROOT=""

while [ $# -gt 0 ]; do
  case "$1" in
    --to) TO_REF=$2; shift 2 ;;
    --skip-backup) SKIP_BACKUP=1; shift ;;
    --repo-root) REPO_ROOT=$2; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -y|--yes) ASSUME_YES=1; shift ;;
    -h|--help)
      printf 'Usage: %s [<project_dir>] [--to <ref>] [--skip-backup] [--repo-root <path>] [--dry-run] [-y]\n' \
        "$(basename "$0")"
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

[ -f "$PROJECT/docker-compose.yml" ] || die "Not a supabase docker project: $PROJECT"
[ -f "$PROJECT/.treq-selfhost-version" ] || warn "Missing .treq-selfhost-version (continuing)"

if [ -z "$TO_REF" ] && [ -f "$BUNDLE_ROOT/SUPABASE_REF" ]; then
  TO_REF=$(tr -d ' \n\r' <"$BUNDLE_ROOT/SUPABASE_REF")
fi

if [ "$SKIP_BACKUP" != "1" ]; then
  if [ "$DRY_RUN" = "1" ]; then
    log "(dry-run) would backup database"
  else
    log "Backing up database before upgrade"
    sh "$SCRIPT_DIR/backup.sh" "$PROJECT" || warn "Backup failed — continuing only if you intend to"
  fi
fi

if [ -x "$PROJECT/update.sh" ] && [ -n "$TO_REF" ]; then
  log "Updating Supabase vendor files toward $TO_REF"
  if [ "$DRY_RUN" = "1" ]; then
    (
      cd "$PROJECT"
      sh update.sh --dry-run --to "$TO_REF" ${ASSUME_YES:+--yes} || true
    )
  else
    (
      cd "$PROJECT"
      if [ "$ASSUME_YES" = "1" ]; then
        sh update.sh --to "$TO_REF" --yes
      else
        sh update.sh --to "$TO_REF"
      fi
    )
  fi
else
  warn "Skipping supabase update.sh (missing script or --to ref)"
fi

if [ "$DRY_RUN" = "1" ]; then
  log "(dry-run) would re-apply treq overlay, sync functions, migrate"
  exit 0
fi

# Re-copy overlay compose (user docker-compose.override.yml is untouched).
cp "$BUNDLE_ROOT/overlay/docker-compose.treq.yml" "$PROJECT/docker-compose.treq.yml"
append_env_missing_keys "$BUNDLE_ROOT/overlay/env/treq.env.example" "$PROJECT/.env"
ensure_compose_override "$PROJECT" "docker-compose.treq.yml"

ASSEMBLE_ARGS="$PROJECT/treq/migrations"
SYNC_ARGS="$PROJECT"
if [ -n "$REPO_ROOT" ]; then
  ASSEMBLE_ARGS="$ASSEMBLE_ARGS --repo-root $REPO_ROOT"
  SYNC_ARGS="$SYNC_ARGS --repo-root $REPO_ROOT"
fi
sh "$SCRIPT_DIR/assemble-migrations.sh" $ASSEMBLE_ARGS
sh "$SCRIPT_DIR/sync-functions.sh" $SYNC_ARGS

# Refresh treq stamp
TREQ_VER=$(tr -d ' \n\r' <"$BUNDLE_ROOT/VERSION")
{
  printf 'treq_selfhost=%s\n' "$TREQ_VER"
  printf 'supabase_ref=%s\n' "$TO_REF"
  printf 'mode=single-tenant\n'
  printf 'upgraded_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} >"$PROJECT/.treq-selfhost-version"

log "Pulling images and recreating stack"
(
  cd "$PROJECT"
  sh run.sh pull
  sh run.sh recreate
)

log "Applying pending treq migrations"
sh "$SCRIPT_DIR/migrate.sh" "$PROJECT"

log "Upgrade complete"
sh "$SCRIPT_DIR/status.sh" "$PROJECT"
