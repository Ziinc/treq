#!/usr/bin/env bash
# Quick smoke against a running stack (prefer test/verify-self-hosted.sh in CI).
set -euo pipefail

BASE="${SUPABASE_URL:-http://127.0.0.1:54321}"
SERVICE="${SERVICE_ROLE_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU}"

echo "== health =="
curl -sf "${BASE}/health"
echo

echo "== rest openapi =="
code="$(curl -s -o /tmp/treq-rest.json -w '%{http_code}' \
  -H "apikey: ${SERVICE}" \
  -H "Authorization: Bearer ${SERVICE}" \
  "${BASE}/rest/v1/")"
echo "HTTP ${code}"
test "${code}" = "200"

echo "== edge (exchange-desktop-token expects 400 without token) =="
code="$(curl -s -o /tmp/treq-fn.json -w '%{http_code}' \
  -X POST "${BASE}/functions/v1/exchange-desktop-token" \
  -H "Content-Type: application/json" \
  -H "apikey: ${SERVICE}" \
  -d '{}')"
echo "HTTP ${code}"
test "${code}" = "400" -o "${code}" = "422"

echo "smoke ok"
