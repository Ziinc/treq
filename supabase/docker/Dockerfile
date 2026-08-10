# syntax=docker/dockerfile:1.7
#
# Fat API image (Alpine): GoTrue + PostgREST + Edge Runtime + nginx
# with treq migrations and Edge Functions baked in.
# Postgres is external — see docker-compose.yml (supabase/postgres sidecar).
#
# Build (from repo root; context is supabase/):
#   docker build -f supabase/docker/Dockerfile -t treq-supabase:local supabase
#
# Run (compose brings up DB + this image):
#   docker compose -f supabase/docker/docker-compose.yml up --build

ARG ALPINE_IMAGE=alpine:3.23
ARG GOTRUE_IMAGE=supabase/gotrue:v2.189.0
ARG POSTGREST_IMAGE=postgrest/postgrest:v14.12
ARG EDGE_RUNTIME_IMAGE=supabase/edge-runtime:v1.74.0

FROM ${GOTRUE_IMAGE} AS gotrue
FROM ${POSTGREST_IMAGE} AS postgrest
FROM ${EDGE_RUNTIME_IMAGE} AS edge

# ── Base ─────────────────────────────────────────────────────────────────────
FROM ${ALPINE_IMAGE}

# ── System packages ──────────────────────────────────────────────────────────
# bash: entrypoint / cron scripts
# curl: healthchecks + merge-queue cron
# nginx: Kong-compatible gateway
# supervisor: multi-process
# postgresql17-client: psql for migrations / role setup
# nodejs+npm: vendor Edge Function deps at build (npm removed after install)
RUN apk add --no-cache \
      bash \
      curl \
      nginx \
      supervisor \
      postgresql17-client

# ── GoTrue (static binary) ───────────────────────────────────────────────────
COPY --from=gotrue /usr/local/bin/auth /usr/local/bin/auth

# ── PostgREST (static binary) ────────────────────────────────────────────────
COPY --from=postgrest /bin/postgrest /usr/local/bin/postgrest

# ── Edge Runtime (glibc) + minimal glibc loader/libs on musl Alpine ──────────
RUN mkdir -p /lib64 /lib/x86_64-linux-gnu
COPY --from=edge /usr/local/bin/edge-runtime /usr/local/bin/edge-runtime
COPY --from=edge /lib64/ld-linux-x86-64.so.2 /lib64/ld-linux-x86-64.so.2
COPY --from=edge /lib/x86_64-linux-gnu/libc.so.6 /lib/x86_64-linux-gnu/
COPY --from=edge /lib/x86_64-linux-gnu/libm.so.6 /lib/x86_64-linux-gnu/
COPY --from=edge /lib/x86_64-linux-gnu/libgcc_s.so.1 /lib/x86_64-linux-gnu/

# ── Treq application layer (build context = supabase/) ───────────────────────
COPY migrations /opt/treq/migrations
COPY seed.sql /opt/treq/seed.sql
COPY functions /home/deno/functions
COPY docker/edge-main /home/deno/functions/main
COPY docker/db /opt/treq/db
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/supervisord.conf /etc/supervisord.conf
COPY docker/entrypoint.sh /opt/treq/bin/entrypoint.sh
COPY docker/apply-treq-migrations.sh /opt/treq/bin/apply-treq-migrations.sh
COPY docker/merge-queue-cron.sh /opt/treq/bin/merge-queue-cron.sh

# Vendor supabase-js so Edge Functions boot without registry egress.
# Import map remaps the esm.sh URL used in source to the local package.
RUN apk add --no-cache nodejs npm \
  && printf '%s\n' \
       '{"name":"treq-edge-functions","private":true,"dependencies":{"@supabase/supabase-js":"2.95.3"}}' \
       > /home/deno/functions/package.json \
  && printf '%s\n' \
       '{"nodeModulesDir":"manual","imports":{"@supabase/supabase-js":"./node_modules/@supabase/supabase-js/dist/index.mjs","https://esm.sh/@supabase/supabase-js@2":"./node_modules/@supabase/supabase-js/dist/index.mjs"}}' \
       > /home/deno/functions/deno.json \
  && npm install --omit=dev --prefix /home/deno/functions \
  && apk del npm \
  && find /home/deno/functions -name '.env' -delete 2>/dev/null || true \
  && chmod +x \
      /opt/treq/bin/entrypoint.sh \
      /opt/treq/bin/apply-treq-migrations.sh \
      /opt/treq/bin/merge-queue-cron.sh \
      /usr/local/bin/auth \
      /usr/local/bin/postgrest \
      /usr/local/bin/edge-runtime \
  && mkdir -p /var/log/nginx /var/lib/nginx /run/nginx /tmp

ENV POSTGRES_DB=postgres \
    POSTGRES_USER=supabase_admin \
    PGHOST=db \
    PGPORT=5432 \
    JWT_EXP=3600 \
    VERIFY_JWT=true \
    GOTRUE_MAILER_AUTOCONFIRM=true \
    GOTRUE_EXTERNAL_EMAIL_ENABLED=true

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --start-period=45s --retries=12 \
  CMD curl -sf http://127.0.0.1:8000/health && curl -sf http://127.0.0.1:9999/health || exit 1

ENTRYPOINT ["/opt/treq/bin/entrypoint.sh"]
