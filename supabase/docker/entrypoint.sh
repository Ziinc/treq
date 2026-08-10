#!/usr/bin/env bash
# Wait for external Postgres, apply treq migrations, run Auth / PostgREST / Edge / nginx.
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
export API_EXTERNAL_URL="${API_EXTERNAL_URL:-${SUPABASE_PUBLIC_URL}/auth/v1}"
export SITE_URL="${SITE_URL:-http://localhost:3001}"
export ADDITIONAL_REDIRECT_URLS="${ADDITIONAL_REDIRECT_URLS:-https://127.0.0.1:3001,treq://auth/callback,https://treq.dev/auth/callback}"

# Internal loopback URL used by Edge Functions talking back to the gateway.
export SUPABASE_URL="${SUPABASE_URL:-http://127.0.0.1:8000}"
export SUPABASE_ANON_KEY="${ANON_KEY}"
export SUPABASE_SERVICE_ROLE_KEY="${SERVICE_ROLE_KEY}"
export SUPABASE_DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:${POSTGRES_PASSWORD}@${PGHOST}:${PGPORT}/${POSTGRES_DB}}"

# GoTrue → external Postgres
export GOTRUE_API_HOST="${GOTRUE_API_HOST:-0.0.0.0}"
export GOTRUE_API_PORT="${GOTRUE_API_PORT:-9999}"
export GOTRUE_DB_DRIVER=postgres
export GOTRUE_DB_DATABASE_URL="postgres://supabase_auth_admin:${POSTGRES_PASSWORD}@${PGHOST}:${PGPORT}/${POSTGRES_DB}"
export GOTRUE_SITE_URL="${SITE_URL}"
export GOTRUE_URI_ALLOW_LIST="${ADDITIONAL_REDIRECT_URLS}"
export GOTRUE_DISABLE_SIGNUP="${GOTRUE_DISABLE_SIGNUP:-false}"
export GOTRUE_JWT_ADMIN_ROLES=service_role
export GOTRUE_JWT_AUD=authenticated
export GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated
export GOTRUE_JWT_EXP="${JWT_EXP}"
export GOTRUE_JWT_SECRET="${JWT_SECRET}"
export GOTRUE_JWT_ISSUER="${API_EXTERNAL_URL}"
export GOTRUE_EXTERNAL_EMAIL_ENABLED="${GOTRUE_EXTERNAL_EMAIL_ENABLED:-true}"
export GOTRUE_MAILER_AUTOCONFIRM="${GOTRUE_MAILER_AUTOCONFIRM:-true}"
export GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED="${GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED:-false}"
export API_EXTERNAL_URL

# Optional OAuth (disabled unless secrets are provided).
if [ -n "${GOTRUE_EXTERNAL_GOOGLE_SECRET:-${SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET:-}}" ]; then
  export GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
  export GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID="${GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID:-719573767717-9vj4pg35shehqe5h2c4f260nu4v7a7qb.apps.googleusercontent.com}"
  export GOTRUE_EXTERNAL_GOOGLE_SECRET="${GOTRUE_EXTERNAL_GOOGLE_SECRET:-${SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET}}"
  export GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI="${GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI:-${API_EXTERNAL_URL}/callback}"
fi
if [ -n "${GOTRUE_EXTERNAL_GITHUB_SECRET:-${SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET:-}}" ]; then
  export GOTRUE_EXTERNAL_GITHUB_ENABLED=true
  export GOTRUE_EXTERNAL_GITHUB_CLIENT_ID="${GOTRUE_EXTERNAL_GITHUB_CLIENT_ID:-Ov23liS0JwuPu5iE1GI3}"
  export GOTRUE_EXTERNAL_GITHUB_SECRET="${GOTRUE_EXTERNAL_GITHUB_SECRET:-${SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET}}"
  export GOTRUE_EXTERNAL_GITHUB_REDIRECT_URI="${GOTRUE_EXTERNAL_GITHUB_REDIRECT_URI:-${API_EXTERNAL_URL}/callback}"
fi

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

# Edge Runtime
export JWT_SECRET
export VERIFY_JWT="${VERIFY_JWT:-true}"
export GITHUB_WEBHOOK_SECRET="${GITHUB_WEBHOOK_SECRET:-}"
export GITHUB_APP_ID="${GITHUB_APP_ID:-}"
export GITHUB_APP_PRIVATE_KEY_BASE64="${GITHUB_APP_PRIVATE_KEY_BASE64:-}"
export MERGE_QUEUE_GITHUB_STUB="${MERGE_QUEUE_GITHUB_STUB:-0}"

mkdir -p /tmp

psql_admin() {
  psql -v ON_ERROR_STOP=1 --no-psqlrc \
    -h "${PGHOST}" -p "${PGPORT}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" "$@"
}

# Wait until the external Supabase Postgres has finished its own init
# (authenticator role exists) and accepts connections.
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

echo "Starting Auth, PostgREST, Edge Runtime, nginx..."
exec /usr/bin/supervisord -c /etc/supervisord.conf
