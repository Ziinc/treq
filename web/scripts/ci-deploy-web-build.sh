#!/usr/bin/env bash
# Same path the Deploy Web `build` job runs after checkout + npm ci.
set -euo pipefail
web_root="$(cd "$(dirname "$0")/.." && pwd)"
src="${1:-}"
cd "$web_root"
if [[ -n "$src" ]]; then
  node scripts/stage-landing-screenshots.mjs "$src"
else
  node scripts/stage-landing-screenshots.mjs
fi
node scripts/assert-landing-screenshots.mjs
export SKIP_LANDING_SCREENSHOTS=1
npm run build
node scripts/assert-build-landing-screenshots.mjs
