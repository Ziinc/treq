# Treq Supabase fat image

Single container with everything needed to run treq's Supabase server-side stack:

| Process | Role |
|---|---|
| Postgres 17 (`supabase/postgres`) | DB + `pgmq` / `wrappers` / vault |
| GoTrue | Auth (`/auth/v1`) |
| PostgREST | REST + RPC (`/rest/v1`) |
| Edge Runtime | Deno functions (`/functions/v1`) |
| nginx | Kong-compatible public gateway (`:8000`) |
| merge-queue cron | Nudges worker (60s) + reconciler (10m) |

Baked in at build time: `supabase/migrations/**`, `supabase/seed.sql`, and `supabase/functions/**`.

This is for local / CI / self-hosted smoke — not a drop-in replacement for Supabase Cloud HA.

## Quick start

```bash
# from repo root
make supabase.docker.build
make supabase.docker.up
make supabase.docker.smoke
```

API: `http://127.0.0.1:54321` (same URL/key shape as `package.json` → `env.dev.supabase`).

Postgres: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`

Stop / remove:

```bash
make supabase.docker.down
```

## Build / run without Make

```bash
docker build -f supabase/docker/Dockerfile -t treq-supabase:local supabase
docker run --rm --name treq-supabase \
  -p 54321:8000 -p 54322:5432 \
  --env-file supabase/docker/.env.example \
  -v treq-supabase-data:/var/lib/postgresql/data \
  treq-supabase:local
```

Or Compose:

```bash
docker compose -f supabase/docker/docker-compose.yml up --build
```

## Environment

See [`.env.example`](./.env.example). Required:

- `POSTGRES_PASSWORD`
- `JWT_SECRET` (≥ 32 chars)
- `ANON_KEY` / `SERVICE_ROLE_KEY` (must match `JWT_SECRET`)

Merge-queue Edge secrets (optional for Auth/REST-only):

- `GITHUB_WEBHOOK_SECRET` (required for webhook acceptance)
- `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY_BASE64` (or `MERGE_QUEUE_GITHUB_STUB=1` for stubbed GitHub side effects)
- OAuth: `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`, `SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET`

## Client wiring

Point the desktop / web client at the gateway:

```ts
createClient("http://127.0.0.1:54321", ANON_KEY)
```

Paths match hosted Supabase: `/auth/v1`, `/rest/v1`, `/functions/v1/<name>`.

`github-webhook` skips gateway JWT checks (HMAC inside the function), same as `supabase/config.toml`.

## Relationship to `supabase start`

| | Fat image | `supabase start` (CLI) |
|---|---|---|
| Process model | One container | Many containers |
| Studio / Inbucket / Analytics | No | Yes (optional) |
| Nested Docker | Not required | Required |
| Migrations / functions | Baked into image | Live-mounted from repo |

Prefer the fat image for agents/CI that cannot reliably run nested Docker bridges. Prefer the CLI for day-to-day schema iteration with Studio.

## Version pins

See [versions.env](./versions.env). Bump when updating against [supabase/docker versions.md](https://github.com/supabase/supabase/blob/master/docker/versions.md).
