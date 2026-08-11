#!/usr/bin/env bash
# Apply treq SQL migrations once (tracked in public._treq_schema_migrations).
set -euo pipefail

PGHOST="${PGHOST:-/var/run/postgresql}"
PGPORT="${PGPORT:-5432}"
PGDATABASE="${POSTGRES_DB:-postgres}"
PGUSER="${POSTGRES_USER:-supabase_admin}"
export PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD="${POSTGRES_PASSWORD:-}"

MIGRATIONS_DIR="${TREQ_MIGRATIONS_DIR:-/opt/treq/migrations}"

psql_cmd() {
  psql -v ON_ERROR_STOP=1 --no-psqlrc -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${PGDATABASE}" "$@"
}

psql_cmd <<'SQL'
create table if not exists public._treq_schema_migrations (
  filename text primary key,
  applied_at timestamptz not null default now()
);
SQL

shopt -s nullglob
for sql in "${MIGRATIONS_DIR}"/*.sql; do
  name="$(basename "${sql}")"
  applied="$(psql_cmd -tAc \
    "select 1 from public._treq_schema_migrations where filename = '${name}'")"
  if [ "${applied}" = "1" ]; then
    echo "skip ${name} (already applied)"
    continue
  fi
  echo "apply ${name}"
  psql_cmd -f "${sql}"
  psql_cmd -c \
    "insert into public._treq_schema_migrations (filename) values ('${name}')"
done

if [ -f /opt/treq/seed.sql ]; then
  echo "apply seed.sql"
  psql_cmd -f /opt/treq/seed.sql
fi
