#!/usr/bin/env bash
# Smoke-test a running treq-supabase fat image on http://127.0.0.1:54321
set -euo pipefail

BASE="${SUPABASE_URL:-http://127.0.0.1:54321}"
ANON="${ANON_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0}"

echo "== health =="
curl -sf "${BASE}/health"
echo

echo "== auth health =="
curl -sf "${BASE}/auth/v1/health"
echo

echo "== rest openapi =="
code="$(curl -s -o /tmp/treq-rest.json -w '%{http_code}' \
  -H "apikey: ${ANON}" \
  -H "Authorization: Bearer ${ANON}" \
  "${BASE}/rest/v1/")"
echo "HTTP ${code}"
test "${code}" = "200"

echo "== edge (exchange-desktop-token expects 400 without token) =="
code="$(curl -s -o /tmp/treq-fn.json -w '%{http_code}' \
  -X POST "${BASE}/functions/v1/exchange-desktop-token" \
  -H "Content-Type: application/json" \
  -H "apikey: ${ANON}" \
  -H "Authorization: Bearer ${ANON}" \
  -d '{}')"
echo "HTTP ${code}"
# 400 = function booted and validated input; 401 = JWT path broken.
test "${code}" = "400" -o "${code}" = "422"

echo "smoke ok"
