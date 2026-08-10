#!/bin/sh
# Tests for self-host assemble / pack / overlay selection.
# Run: sh self-host/tests/run.sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
BUNDLE="$ROOT/self-host"
PASS=0
FAIL=0

assert_eq() {
  _name=$1
  _got=$2
  _want=$3
  if [ "$_got" = "$_want" ]; then
    PASS=$((PASS + 1))
    printf 'ok - %s\n' "$_name"
  else
    FAIL=$((FAIL + 1))
    printf 'not ok - %s\n  got:  %s\n  want: %s\n' "$_name" "$_got" "$_want"
  fi
}

assert_file() {
  _name=$1
  _path=$2
  if [ -f "$_path" ]; then
    PASS=$((PASS + 1))
    printf 'ok - %s\n' "$_name"
  else
    FAIL=$((FAIL + 1))
    printf 'not ok - %s (missing %s)\n' "$_name" "$_path"
  fi
}

assert_not_file() {
  _name=$1
  _path=$2
  if [ ! -f "$_path" ]; then
    PASS=$((PASS + 1))
    printf 'ok - %s\n' "$_name"
  else
    FAIL=$((FAIL + 1))
    printf 'not ok - %s (unexpected %s)\n' "$_name" "$_path"
  fi
}

assert_contains() {
  _name=$1
  _path=$2
  _needle=$3
  if grep -q "$_needle" "$_path"; then
    PASS=$((PASS + 1))
    printf 'ok - %s\n' "$_name"
  else
    FAIL=$((FAIL + 1))
    printf 'not ok - %s (no match for %s in %s)\n' "$_name" "$_needle" "$_path"
  fi
}

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# --- assemble-migrations replaces stripe ---
DEST="$TMP/migrations"
sh "$BUNDLE/scripts/assemble-migrations.sh" "$DEST" --repo-root "$ROOT" >/dev/null

assert_file "assembles 001 profiles" "$DEST/001_profiles_and_subscriptions.sql"
assert_file "assembles single-tenant 002" "$DEST/002_single_tenant_subscriptions.sql"
assert_not_file "does not copy stripe 002" "$DEST/002_stripe_fdw.sql"
assert_file "assembles merge queue 003" "$DEST/003_merge_queue.sql"
assert_contains "single-tenant grants pro" \
  "$DEST/002_single_tenant_subscriptions.sql" "'pro'::text as plan"

count=$(find "$DEST" -maxdepth 1 -type f -name '*.sql' | wc -l | tr -d ' ')
# 001 + single-tenant 002 + 003..007 = 7
assert_eq "assembles seven migration files" "$count" "7"

# --- sync-functions preserves main and copies treq ---
PROJ="$TMP/project"
mkdir -p "$PROJ/volumes/functions/main" "$PROJ/volumes/functions/hello"
printf 'vendor\n' >"$PROJ/volumes/functions/main/index.ts"
printf 'sample\n' >"$PROJ/volumes/functions/hello/index.ts"

sh "$BUNDLE/scripts/sync-functions.sh" "$PROJ" --repo-root "$ROOT" >/dev/null

assert_file "keeps vendor main router" "$PROJ/volumes/functions/main/index.ts"
assert_not_file "removes sample hello" "$PROJ/volumes/functions/hello/index.ts"
assert_file "copies exchange-desktop-token" \
  "$PROJ/volumes/functions/exchange-desktop-token/index.ts"
assert_file "copies merge-queue shared helpers" \
  "$PROJ/volumes/functions/_shared/merge-queue/state-machine.ts"
assert_file "copies github-webhook" "$PROJ/volumes/functions/github-webhook/index.ts"

# --- ensure_compose_override / append via lib ---
# shellcheck source=../scripts/lib.sh
. "$BUNDLE/scripts/lib.sh"
ENVDIR="$TMP/envtest"
mkdir -p "$ENVDIR"
printf 'COMPOSE_FILE=docker-compose.yml\nFOO=1\n' >"$ENVDIR/.env"
ensure_compose_override "$ENVDIR" "docker-compose.treq.yml"
got=$(grep '^COMPOSE_FILE=' "$ENVDIR/.env" | cut -d= -f2-)
assert_eq "layers treq compose override" "$got" "docker-compose.yml:docker-compose.treq.yml"
ensure_compose_override "$ENVDIR" "docker-compose.treq.yml"
got=$(grep '^COMPOSE_FILE=' "$ENVDIR/.env" | cut -d= -f2-)
assert_eq "idempotent compose override" "$got" "docker-compose.yml:docker-compose.treq.yml"

printf 'BAR=2\nSITE_URL=http://x\n' >"$TMP/extra.env"
append_env_missing_keys "$TMP/extra.env" "$ENVDIR/.env"
assert_contains "appends missing env keys" "$ENVDIR/.env" '^BAR=2'
assert_contains "keeps existing keys" "$ENVDIR/.env" '^FOO=1'
# SITE_URL already absent so should be added
assert_contains "adds SITE_URL from example" "$ENVDIR/.env" '^SITE_URL=http://x'

# --- pack staging (skip vendor refresh) ---
# Use a tiny OUT under TMP
sh "$BUNDLE/pack.sh" --out "$TMP/dist" --skip-refresh --repo-root "$ROOT" >/dev/null
TAR=$(echo "$TMP"/dist/treq-selfhost-*.tar.gz)
assert_file "pack writes tarball" "$TAR"

EXTRACT="$TMP/extract"
mkdir -p "$EXTRACT"
tar -xzf "$TAR" -C "$EXTRACT"
NAME=$(ls "$EXTRACT")
assert_file "pack includes vendor compose" \
  "$EXTRACT/$NAME/vendor/supabase-docker/docker-compose.yml"
assert_file "pack includes bootstrap" "$EXTRACT/$NAME/bootstrap.sh"
assert_file "pack freezes single-tenant migration" \
  "$EXTRACT/$NAME/treq-assets/migrations/002_single_tenant_subscriptions.sql"
assert_not_file "pack omits stripe migration" \
  "$EXTRACT/$NAME/treq-assets/migrations/002_stripe_fdw.sql"
assert_file "pack freezes edge functions" \
  "$EXTRACT/$NAME/treq-assets/functions/exchange-desktop-token/index.ts"
assert_file "pack includes treq compose overlay" \
  "$EXTRACT/$NAME/overlay/docker-compose.treq.yml"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
