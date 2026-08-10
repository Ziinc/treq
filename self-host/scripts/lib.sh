#!/bin/sh
# Shared helpers for treq self-host scripts.
# shellcheck disable=SC2034

set -eu

self_host_root() {
  # scripts/ -> self-host/
  CDPATH= cd -- "$(dirname "$0")/.." && pwd
}

die() {
  printf "ERROR: %s\n" "$*" >&2
  exit 1
}

log() {
  printf "===> %s\n" "$*"
}

warn() {
  printf "WARNING: %s\n" "$*" >&2
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

# Resolve the install/project directory.
# Prefer TREQ_SELFHOST_DIR, else CWD if it looks like a deployment, else die.
resolve_project_dir() {
  if [ -n "${TREQ_SELFHOST_DIR:-}" ]; then
    printf '%s' "$TREQ_SELFHOST_DIR"
    return
  fi
  if [ -f ./docker-compose.yml ] && [ -f ./.treq-selfhost-version ]; then
    pwd
    return
  fi
  die "Not a treq self-host project directory. Set TREQ_SELFHOST_DIR or cd into the install."
}

read_stamp() {
  # read_stamp <file> <key>
  # Prints value for key=value lines.
  _file=$1
  _key=$2
  [ -f "$_file" ] || return 1
  grep "^${_key}=" "$_file" | head -n1 | cut -d= -f2-
}

append_env_missing_keys() {
  # append_env_missing_keys <example> <target>
  # Copies KEY= lines from example into target when KEY is absent.
  _example=$1
  _target=$2
  [ -f "$_example" ] || return 0
  [ -f "$_target" ] || die "Missing env file: $_target"
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ''|\#*) continue ;;
    esac
    key=$(printf '%s' "$line" | cut -d= -f1)
    [ -n "$key" ] || continue
    if ! grep -q "^${key}=" "$_target"; then
      printf '%s\n' "$line" >>"$_target"
      printf 'appended env key: %s\n' "$key"
    fi
  done <"$_example"
}

ensure_compose_override() {
  # ensure_compose_override <project_dir> <override_filename>
  # Adds override to COMPOSE_FILE in .env if missing.
  _dir=$1
  _override=$2
  _env="$_dir/.env"
  [ -f "$_env" ] || die "Missing $_env"
  _current=$(grep '^COMPOSE_FILE=' "$_env" | head -n1 | cut -d= -f2- | tr -d "\r\"'" || true)
  if [ -z "$_current" ]; then
    printf 'COMPOSE_FILE=docker-compose.yml:%s\n' "$_override" >>"$_env"
    return
  fi
  case ":$_current:" in
    *":$_override:"*) return ;;
  esac
  _tmp=$(mktemp)
  awk -v ov="$_override" '
    BEGIN { done=0 }
    /^COMPOSE_FILE=/ {
      val=$0
      sub(/^COMPOSE_FILE=/,"",val)
      gsub(/["\047\r]/,"",val)
      print "COMPOSE_FILE=" val ":" ov
      done=1
      next
    }
    { print }
    END { if (!done) print "COMPOSE_FILE=docker-compose.yml:" ov }
  ' "$_env" >"$_tmp"
  mv "$_tmp" "$_env"
}

docker_compose() {
  # Run docker compose using project .env COMPOSE_FILE.
  require_cmd docker
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  else
    die "Docker Compose plugin required (docker compose)"
  fi
}

psql_in_db() {
  # psql_in_db <project_dir> <sql args...>
  _dir=$1
  shift
  (
    cd "$_dir"
    docker_compose exec -T db psql -U postgres -v ON_ERROR_STOP=1 "$@"
  )
}
