#!/bin/sh
set -eu
# shellcheck disable=SC1091
. /etc/treq/env
NGINX_CONF="${NGINX_CONF:-/etc/nginx/nginx.conf}"
# -g 'daemon off;' keeps nginx in the foreground for supervise-daemon.
exec /usr/sbin/nginx -c "${NGINX_CONF}" -g 'daemon off;'
