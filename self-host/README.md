# treq self-host (single-tenant)

Run treq's backend on your own server. This bundle pins a Supabase Docker Compose
stack, layers treq migrations and edge functions on top, and replaces Stripe
billing with a single-tenant pro subscription for every authenticated user.

## What you get

- Vendored Supabase Docker config (pinned in `SUPABASE_REF`)
- treq SQL migrations with Stripe swapped for single-tenant subscriptions
- treq edge functions (desktop auth handoff, GitHub app, merge queue)
- Ops scripts: bootstrap, upgrade, migrate, backup, restore, status, secrets

The desktop and web clients still talk to this stack over HTTP. Point them at
your `SUPABASE_PUBLIC_URL` and anon key after install.

## Requirements

- Docker Engine with the Compose plugin
- `openssl`, `gzip`, `git` (git only needed to refresh the vendor pin)
- 4 GB RAM minimum, 8 GB recommended

## Quick start (from this repo)

```sh
cd self-host
sh bootstrap.sh -y --project-dir ../treq-selfhost --start
cd ../treq-selfhost
sh treq-ops.sh secrets
```

`bootstrap.sh` copies the vendored compose stack into the project directory,
generates secrets, syncs functions, pulls images, starts the stack, and applies
migrations when you pass `--start`.

## Fat bundle (offline / release artifact)

```sh
cd self-host
sh pack.sh --skip-refresh    # or omit --skip-refresh to re-pull the pin
# -> dist/treq-selfhost-<version>.tar.gz
```

On the server:

```sh
tar -xzf treq-selfhost-<version>.tar.gz
cd treq-selfhost-<version>
sh bootstrap.sh -y --project-dir /opt/treq --public-url https://supabase.example.com \
  --site-url https://treq.example.com --start
```

The tarball includes frozen `treq-assets/` so the server does not need a full
treq checkout.

## Common ops

From the project directory:

| Command | Action |
|---|---|
| `sh treq-ops.sh status` | Compose status, stamps, migration list |
| `sh treq-ops.sh secrets` | Print API keys and dashboard password |
| `sh treq-ops.sh migrate` | Apply pending treq SQL migrations |
| `sh treq-ops.sh backup` | `pg_dump` to `backups/` |
| `sh treq-ops.sh restore <file.sql.gz>` | Restore a dump |
| `sh treq-ops.sh sync-functions` | Re-copy edge functions from the bundle |
| `sh treq-ops.sh upgrade` | Backup, update vendor, re-layer treq, migrate |
| `sh run.sh start\|stop\|logs` | Upstream compose helpers |

Set `TREQ_SELFHOST_BUNDLE` if the bundle scripts move away from the path
recorded at bootstrap time.

## Single-tenant mode

Migration `002_single_tenant_subscriptions.sql` replaces `002_stripe_fdw.sql`.
`public.subscriptions` always returns `plan=pro` / `status=active` for the
current auth user. There is no Stripe FDW and no billing webhook.

## GitHub App (optional, for merge queue)

Set these in the project `.env`, then recreate the functions service:

```sh
GITHUB_APP_ID=...
GITHUB_APP_PRIVATE_KEY_BASE64=...
GITHUB_WEBHOOK_SECRET=...
sh run.sh recreate functions
```

Webhook URL: `$SUPABASE_PUBLIC_URL/functions/v1/github-webhook`

## Client configuration

After install, configure clients with:

```json
{
  "supabase": {
    "url": "https://supabase.example.com",
    "anonKey": "<ANON_KEY from treq-ops.sh secrets>"
  },
  "webUrl": "https://treq.example.com"
}
```

The stock desktop build ships with treq cloud URLs. A self-hosted tenant needs a
build or runtime config that points at your stack.

## Upgrading

1. Update this bundle (newer `VERSION` / `SUPABASE_REF`, or a newer tarball).
2. From the project dir: `sh treq-ops.sh upgrade` (or
   `sh /path/to/self-host/scripts/upgrade.sh . --to self-hosted/vX.Y.Z -y`).
3. Review `vendor/supabase-docker/CHANGELOG.md` for breaking compose changes.

`upgrade.sh` takes a DB backup first unless you pass `--skip-backup`.

## Layout

```
self-host/
  VERSION                 # bundle version
  SUPABASE_REF            # pinned supabase self-hosted tag
  bootstrap.sh
  pack.sh
  overlay/                # treq compose + env + single-tenant migration
  scripts/                # ops
  vendor/supabase-docker/ # fat, pinned upstream compose tree
  tests/                  # shell tests for assemble/pack
```

## Security

Change every default secret before exposing the stack. Put TLS in front of Kong
(Caddy/nginx overrides ship in the vendor tree). Keep `.env` and `backups/*.env`
off shared disks.
