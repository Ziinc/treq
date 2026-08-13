#!/bin/sh
set -eu
# shellcheck disable=SC1091
. /etc/treq/env
exec /opt/treq/bin/merge-queue-cron.sh
