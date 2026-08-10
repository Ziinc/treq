# Treq Supabase fat API image (Alpine, single-tenant)

Alpine-based image with the Supabase **API** processes for single-tenant
self-hosted treq. **No GoTrue** — there is no `/auth/v1` user login surface.

| Process | Role |
|---|---|
| PostgREST | REST + RPC (`/rest/v1`) |
| Edge Runtime | Deno functions (`/functions/v1`) |
| nginx | Kong-compatible public gateway (`:8000`) |
| merge-queue cron | Nudges worker (60s) + reconciler (10m) |

Postgres is a compose sidecar (`supabase/postgres`). Use `SERVICE_ROLE_KEY` as
the API credential (bypasses RLS); there are no end-user sessions.

Dockerfile layers: `alpine:3.23` → system packages → PostgREST → Edge Runtime →
treq migrations/functions → vendored supabase-js.

## Quick start

```bash
make supabase.docker.build
make supabase.docker.up
make supabase.docker.smoke
```

API: `http://127.0.0.1:54321`  
Postgres: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`

## CI / full verification

```bash
make supabase.docker.test
```

This brings up `docker-compose.test.yml` and runs
[`test/verify-self-hosted.sh`](./test/verify-self-hosted.sh), which checks:

- Gateway `/health` (and that `/auth/v1` is absent)
- Data API: OpenAPI, `profiles` read, `merge_queue_metrics` RPC via service_role
- Edge: `exchange-desktop-token`, `merge-queue-worker`, `github-webhook` HMAC

GitHub Actions: `.github/workflows/supabase-docker.yml`.

## Environment

See [`.env.example`](./.env.example). Required: `PGHOST`, `POSTGRES_PASSWORD`,
`JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`. Default `VERIFY_JWT=false`.

## Version pins

See [versions.env](./versions.env).
