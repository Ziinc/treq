#!/usr/bin/env bash
# Wait for external Postgres, apply treq migrations, run PostgREST / Edge / nginx.
# Single-tenant self-hosted: no GoTrue.
set -euo pipefail

: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${JWT_SECRET:?JWT_SECRET is required}"
: "${ANON_KEY:?ANON_KEY is required}"
: "${SERVICE_ROLE_KEY:?SERVICE_ROLE_KEY is required}"
: "${PGHOST:?PGHOST is required (external Postgres hostname)}"

export POSTGRES_DB="${POSTGRES_DB:-postgres}"
export POSTGRES_USER="${POSTGRES_USER:-supabase_admin}"
export PGPORT="${PGPORT:-5432}"
export POSTGRES_PORT="${POSTGRES_PORT:-${PGPORT}}"
export JWT_EXP="${JWT_EXP:-3600}"
export PGPASSWORD="${POSTGRES_PASSWORD}"
export PGUSER="${POSTGRES_USER}"
export PGDATABASE="${POSTGRES_DB}"

# Public URL clients use to reach this container (mapped host port).
export SUPABASE_PUBLIC_URL="${SUPABASE_PUBLIC_URL:-http://127.0.0.1:8000}"

# Internal loopback URL used by Edge Functions talking back to the gateway.
export SUPABASE_URL="${SUPABASE_URL:-http://127.0.0.1:8000}"
export SUPABASE_ANON_KEY="${ANON_KEY}"
export SUPABASE_SERVICE_ROLE_KEY="${SERVICE_ROLE_KEY}"
export SUPABASE_DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:${POSTGRES_PASSWORD}@${PGHOST}:${PGPORT}/${POSTGRES_DB}}"

# PostgREST → external Postgres
export PGRST_DB_URI="postgres://authenticator:${POSTGRES_PASSWORD}@${PGHOST}:${PGPORT}/${POSTGRES_DB}"
export PGRST_DB_SCHEMAS="${PGRST_DB_SCHEMAS:-public,graphql_public}"
export PGRST_DB_EXTRA_SEARCH_PATH="${PGRST_DB_EXTRA_SEARCH_PATH:-public,extensions}"
export PGRST_DB_ANON_ROLE=anon
export PGRST_DB_MAX_ROWS="${PGRST_DB_MAX_ROWS:-1000}"
export PGRST_JWT_SECRET="${JWT_SECRET}"
export PGRST_DB_USE_LEGACY_GUCS=false
export PGRST_APP_SETTINGS_JWT_SECRET="${JWT_SECRET}"
export PGRST_APP_SETTINGS_JWT_EXP="${JWT_EXP}"

# Edge Runtime — single-tenant defaults to no gateway JWT checks.
export JWT_SECRET
export VERIFY_JWT="${VERIFY_JWT:-false}"
export GITHUB_WEBHOOK_SECRET="${GITHUB_WEBHOOK_SECRET:-}"
export GITHUB_APP_ID="${GITHUB_APP_ID:-}"
export GITHUB_APP_PRIVATE_KEY_BASE64="${GITHUB_APP_PRIVATE_KEY_BASE64:-}"
export MERGE_QUEUE_GITHUB_STUB="${MERGE_QUEUE_GITHUB_STUB:-0}"

mkdir -p /tmp

psql_admin() {
  psql -v ON_ERROR_STOP=1 --no-psqlrc \
    -h "${PGHOST}" -p "${PGPORT}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" "$@"
}

wait_for_postgres() {
  local ready_count=0
  local i
  echo "Waiting for Postgres at ${PGHOST}:${PGPORT}..."
  for i in $(seq 1 240); do
    if psql_admin -tAc "select 1" >/dev/null 2>&1 \
      && psql_admin -tAc "select 1 from pg_roles where rolname = 'authenticator'" 2>/dev/null | grep -q 1; then
      ready_count=$((ready_count + 1))
      if [ "${ready_count}" -ge 3 ]; then
        echo "Postgres is ready."
        return 0
      fi
    else
      ready_count=0
    fi
    sleep 1
  done
  echo "Postgres at ${PGHOST}:${PGPORT} did not become ready in time" >&2
  return 1
}

set_role_password() {
  local role="$1"
  local exists
  exists="$(psql_admin -tAc "select 1 from pg_roles where rolname = '${role}'" || true)"
  if [ "${exists}" = "1" ]; then
    psql_admin -c "alter role \"${role}\" with password '${POSTGRES_PASSWORD}'"
  else
    echo "skip password for missing role ${role}"
  fi
}

wait_for_postgres

echo "Applying role passwords + JWT settings..."
for role in authenticator pgbouncer supabase_auth_admin supabase_storage_admin supabase_functions_admin postgres; do
  set_role_password "${role}"
done
psql_admin -f /opt/treq/db/jwt.sql

echo "Applying treq migrations..."
/opt/treq/bin/apply-treq-migrations.sh

echo "Starting PostgREST, Edge Runtime, nginx..."
exec /usr/bin/supervisord -c /etc/supervisord.conf
