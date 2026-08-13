# AAR: Slimming the treq Supabase fat API image

_After-action notes for the OpenRC, vendor, strip, and UPX work on the self-hosted API image (PR #268, branch `cursor/supabase-fat-docker-dc9d`)._

Date: 2026-08-13. Scope: `supabase/docker/**` only. Postgres stays a compose sidecar.

## Mission

Ship a single-tenant self-hosted Supabase **API** image that treq can run without GoTrue, without shipping Python or Node at runtime, and without pulling `@supabase/supabase-js` from the network when Edge Functions boot.

Keep Kong-shaped paths (`/rest/v1`, `/functions/v1`, `/health`). Prove the stack with `make supabase.docker.test`.

## Starting point

`main` already had the fat image from [#248](https://github.com/treq-dev/treq/pull/248): Alpine base, PostgREST, Edge Runtime, nginx, supervisord, and a `supabase/postgres` sidecar.

That image worked. It still carried waste:

| Problem | Cause |
| --- | --- |
| Python on disk | `supervisor` / supervisord |
| Node left behind | `npm install` of supabase-js, then `apk del npm` without removing `nodejs` |
| Large Edge binary | Unstripped `edge-runtime` (~158 MB) |
| Network dependency | Functions imported `https://esm.sh/@supabase/supabase-js@2` |

Measured size before this PR's strip/UPX pass: about **213 MB** once OpenRC and the vendor bundle were in place, or about **365 MB** earlier while Node and Python were still present.

## What we changed

### Process model: OpenRC instead of supervisord

Deleted `supabase/docker/supervisord.conf`. Added OpenRC unit scripts under `supabase/docker/openrc/` plus thin wrappers that source `/etc/treq/env`.

Services in the `default` runlevel:

1. `postgrest`
2. `edge-runtime`
3. `nginx-gateway`
4. `merge-queue-cron`

Each unit uses `supervisor=supervise-daemon` so a crashed worker restarts. The entrypoint runs `openrc default`, then `exec sleep infinity` under `tini`. Docker keeps one long-lived PID. OpenRC owns the workers.

`/etc/rc.conf` sets `rc_sys="docker"`, `rc_env_allow="*"`, and `rc_provide="loopback net"` so OpenRC does not try to bring up real hardware networking inside the container.

### Env bridge: `/etc/treq/env`

`supervise-daemon` does not inherit the entrypoint environment into service wrappers. The entrypoint writes a shell-safe env file to `/etc/treq/env` (mode `600`) after migrations. Every `run-*.sh` wrapper sources that file before `exec`.

Keep this pattern if you add another long-running process.

### Offline supabase-js: build-stage esbuild + `deno.json`

Multi-stage `vendor` image (`node:22-alpine`):

1. Install `@supabase/supabase-js@2.95.3` and `esbuild`.
2. Bundle `export { createClient, SupabaseClient } from '@supabase/supabase-js'` with `--platform=browser --format=esm --minify`.
3. Copy only `/supabase-js.mjs` (~168 KB) into the runtime tree at `/home/deno/functions/_vendor/supabase-js.mjs`.

`supabase/docker/deno.json` remaps both bare and CDN import forms to that file:

```json
{
  "imports": {
    "@supabase/supabase-js": "./_vendor/supabase-js.mjs",
    "https://esm.sh/@supabase/supabase-js@2": "./_vendor/supabase-js.mjs"
  }
}
```

Function sources still say `from "https://esm.sh/@supabase/supabase-js@2"`. Deno resolves them through the import map. You do not rewrite every Edge Function to change the vendor strategy.

`--platform=neutral` failed because esbuild ignored package `"main"` fields for supabase subpackages. Switching to `--platform=browser` resolved the subpath mains.

### Edge Runtime on musl Alpine

`edge-runtime` is a glibc binary. The Alpine image copies a minimal loader and libs from `supabase/edge-runtime:v1.74.0`:

- `/lib64/ld-linux-x86-64.so.2`
- `libc.so.6`, `libm.so.6`, `libgcc_s.so.1` under `/lib/x86_64-linux-gnu/`

Do not replace that copy with the GitHub release tarball layout. The release unpacks larger (~235 MB) because it ships `onnx` and absl as separate shared objects. The Docker image binary is one ~158 MB file and is the better starting point.

### Strip + UPX

Discarded `edge-pack` stage on Alpine:

1. `strip --strip-unneeded` (~158 MB → ~128 MB).
2. `upx -9` (~128 MB → **44 MB**, about 47 seconds).
3. `upx -t` integrity check.
4. `/edge-runtime --version` smoke exec using the same glibc stubs.

`--ultra-brute` was tried and abandoned. It sat for well over 15 minutes with no finish in this environment. `-9` is the practical ceiling for CI.

Debian `bookworm-slim` has no `upx` / `upx-ucl` package in main. Pack on Alpine instead.

## Final layout

```
supabase/docker/
  Dockerfile              # vendor + edge-pack + Alpine runtime
  entrypoint.sh           # wait for DB, migrations, /etc/treq/env, openrc
  deno.json               # import map → _vendor/supabase-js.mjs
  nginx.conf              # /health, /rest/v1, /functions/v1 (no /auth/v1)
  openrc/                 # init.d units + run-*.sh wrappers
  docker-compose.yml      # db + API
  docker-compose.test.yml # CI stack on :54321
  test/verify-self-hosted.sh
  versions.env
```

Makefile targets cover build, up, down, smoke, test, and logs (`supabase.docker.*`).

CI workflow `.github/workflows/supabase-docker.yml` runs the test compose file and the verify script.

## Size results

| Stage | Image size (approx) | Notes |
| --- | --- | --- |
| Early fat (supervisor + leftover Node) | ~365 MB | Before this slim pass |
| OpenRC + vendor, unstripped Edge | ~213 MB | Edge still ~158 MB |
| After strip + `upx -9` | **~94 MB** | Edge binary 44 MB on disk |

Rough layer accounting after the final pack:

| Piece | Size |
| --- | --- |
| UPX'd `edge-runtime` | 44 MB |
| PostgREST | 20 MB |
| Alpine + apk (bash, curl, nginx, openrc, psql, tini) | ~15–23 MB |
| glibc stubs | ~3 MB |
| Functions + vendor + migrations | <1 MB |

Edge Runtime still dominates. Further cuts need a custom Edge build without `onnx`, or a split image that omits Edge.

## Single-tenant auth shape

No GoTrue. nginx has no `/auth/v1`. Default `VERIFY_JWT=false`. Clients use `SERVICE_ROLE_KEY` for data APIs (bypasses RLS). There are no end-user sessions in this mode.

The edge main router still supports JWT verification when `VERIFY_JWT=true`. Webhook routes can skip that check.

## Verification

`make supabase.docker.test` passed **13/13** after strip+UPX:

- Gateway `/health`
- `/auth/v1` absent
- PostgREST OpenAPI and `profiles` via service_role
- `merge_queue_metrics` RPC
- Edge: `exchange-desktop-token`, `merge-queue-worker`, `github-webhook` HMAC

Runtime checks: no `python`, `node`, `npm`, `supervisord`, or `upx` on PATH. Pack tools live only in the discarded `edge-pack` stage.

## Failures worth remembering

### Dockerfile brace groups

A `RUN` line that broke after `&& {` with nested `echo` lines made BuildKit treat `echo` as a Dockerfile instruction. Use `printf '%s\n' ... >> /etc/rc.conf` instead.

### OpenRC `command_args` and env

You cannot rely on shell expansion of env vars inside OpenRC `command_args`. Wrap the real binary in a script that sources `/etc/treq/env`.

### Rebase onto `main` after #248 landed

Replaying the branch's early "add fat image" commits onto `main` produced add/add conflicts across all of `supabase/docker/`. Soft-resetting the whole branch tip onto `main` also staged unrelated app reverts from the old tip.

What worked: `git reset --hard origin/main`, then `git checkout <tip> -- supabase/docker/`, then `git rm` for files deleted on the tip (`supervisord.conf`). Commit that delta only.

### Nested Docker networking

API containers sometimes could not reach the `db` service until `prepare-network.sh` set bridge netfilter knobs. `supabase.docker.up` and `supabase.docker.test` already call that script. Keep it when you debug "postgres never becomes ready" in nested Docker.

### UPX cold start

The packed binary decompresses on first exec. Healthchecks already use a long `start_period`. If Edge flaps on first boot in a tighter environment, widen that window before blaming OpenRC.

## Decisions log

| Choice | Kept? | Why |
| --- | --- | --- |
| Alpine over Debian slim | Yes | Slim base (~8 MB). Edge stays glibc via copied stubs. |
| OpenRC over supervisord | Yes | No Python. Respawn via `supervise-daemon`. |
| OpenRC over a hand-rolled shell loop | Yes | Explicit runlevel and unit files. Size cost is small. |
| esbuild vendor over leaving `node_modules` | Yes | Removes Node from the runtime image. |
| Import map over rewriting function imports | Yes | Production sources stay CDN URLs. Offline remap is local. |
| Strip Edge | Yes | ~30 MB, seconds, low risk. |
| `upx -9` | Yes | ~84 MB more off the binary, ~47 s pack time. |
| `upx --ultra-brute` | No | Build time unbounded for CI. |
| Custom Edge without `onnx` | Not yet | Largest remaining cut. Needs a from-source build. |
| Drop nginx / bash / curl / psql | Not yet | Small wins (~5–10 MB combined). Separate cleanup. |

## Follow-ups

1. Custom Edge Runtime build without `onnx` if you need the image well under ~100 MB with headroom.
2. Optional split images: REST+nginx alone vs functions alone, for tenants that skip Edge.
3. Replace bash with BusyBox ash and curl with BusyBox wget if you want another few MB.
4. Move SQL migrations to an init Job so the runtime image can drop `postgresql17-client`.
5. Revisit UPX if a scanner or seccomp profile rejects packed binaries in a target host.

## How to rebuild and test

```bash
make supabase.docker.build
make supabase.docker.test
docker images treq-supabase:test
docker run --rm --entrypoint sh treq-supabase:test -c 'ls -lh /usr/local/bin/edge-runtime'
```

Pins live in `supabase/docker/versions.env` (Alpine 3.23, PostgREST v14.12, Edge Runtime v1.74.0, Postgres `supabase/postgres:17.6.1.136`).

## Related paths

- Image and compose: `supabase/docker/`
- Edge Functions: `supabase/functions/`
- PR: https://github.com/treq-dev/treq/pull/268
- Prior fat-image landing: https://github.com/treq-dev/treq/pull/248
