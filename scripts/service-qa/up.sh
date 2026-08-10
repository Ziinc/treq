#!/usr/bin/env bash
# Bring up the local Supabase CLI stack for service-qa.
# Nested Docker (Cloud Agent VMs) often needs vfs storage + bridge netfilter
# disabled so containers on the supabase bridge can reach each other.
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"

if ! command -v supabase >/dev/null 2>&1; then
	echo "supabase CLI not found. Install: https://supabase.com/docs/guides/local-development/cli/getting-started" >&2
	exit 1
fi

if ! docker info >/dev/null 2>&1; then
	echo "Docker is not reachable. Start the daemon (service-qa needs it)." >&2
	exit 1
fi

# Inter-container TCP on custom bridges fails when bridge-nf-call-iptables=1
# and Docker's DOCKER chain DROPs unmatched traffic (common in nested Docker).
if [ -w /proc/sys/net/bridge/bridge-nf-call-iptables ] 2>/dev/null; then
	echo 0 >/proc/sys/net/bridge/bridge-nf-call-iptables || true
	echo 0 >/proc/sys/net/bridge/bridge-nf-call-ip6tables || true
elif command -v sysctl >/dev/null 2>&1; then
	sysctl -w net.bridge.bridge-nf-call-iptables=0 >/dev/null 2>&1 || true
	sysctl -w net.bridge.bridge-nf-call-ip6tables=0 >/dev/null 2>&1 || true
fi

# Offline Edge Function client bundle (avoids Deno npm/esm registry at worker boot).
node scripts/service-qa/bundle-supabase-js.mjs

# Skip analytics/studio/storage — not required for Auth/RPC/Edge service-qa.
excludes=(logflare vector studio imgproxy storage-api)

supabase start --exclude "$(IFS=,; echo "${excludes[*]}")"
supabase db reset --local

echo "service-qa stack ready. Run: npm run service-qa"
