#!/usr/bin/env bash
# Periodically nudge merge-queue worker + reconciler (pg_cron substitute).
set -euo pipefail

WORKER_INTERVAL="${MERGE_QUEUE_WORKER_INTERVAL_SEC:-60}"
RECONCILER_INTERVAL="${MERGE_QUEUE_RECONCILER_INTERVAL_SEC:-600}"
BASE_URL="${SUPABASE_PUBLIC_URL:-http://127.0.0.1:8000}"
SERVICE_KEY="${SERVICE_ROLE_KEY:?SERVICE_ROLE_KEY is required}"

worker_tick=0
reconciler_tick=0

post() {
  local path="$1"
  local body="$2"
  curl -sS -m 30 -X POST "${BASE_URL}${path}" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${SERVICE_KEY}" \
    -H "apikey: ${SERVICE_KEY}" \
    -d "${body}" >/dev/null || true
}

# Wait until the gateway is up before the first tick.
for _ in $(seq 1 60); do
  if curl -sf -m 2 "${BASE_URL}/health" >/dev/null; then
    break
  fi
  sleep 2
done

while true; do
  sleep 5
  worker_tick=$((worker_tick + 5))
  reconciler_tick=$((reconciler_tick + 5))

  if [ "${worker_tick}" -ge "${WORKER_INTERVAL}" ]; then
    worker_tick=0
    post "/functions/v1/merge-queue-worker" '{"reason":"cron"}'
  fi

  if [ "${reconciler_tick}" -ge "${RECONCILER_INTERVAL}" ]; then
    reconciler_tick=0
    post "/functions/v1/merge-queue-reconciler" '{}'
  fi
done
