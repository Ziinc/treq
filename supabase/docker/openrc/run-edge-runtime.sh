#!/bin/sh
set -eu
# shellcheck disable=SC1091
. /etc/treq/env
# deno.json remaps esm.sh/@supabase/supabase-js to the offline vendor bundle.
cd /home/deno/functions
exec /usr/local/bin/edge-runtime start \
  --main-service /home/deno/functions/main \
  --port "${FUNCTIONS_HTTP_PORT:-9000}" \
  --policy oneshot
