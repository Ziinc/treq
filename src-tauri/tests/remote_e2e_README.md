# Phase 8: Remote SSH real-API test infrastructure

This document maps prds/remote-ssh.md's 16 "Acceptance criteria" to the tests
that cover them, and states plainly which run today in this sandbox versus
which require real credentials this sandbox does not have.

Two files hold the real-API (non-mocked) suite:

- `src-tauri/tests/remote_e2e.rs` - real Fly Sprites provider adapter calls.
- `supabase/functions/tests/remote_e2e.test.ts` - real deployed Supabase
  Edge Function calls against a dedicated test project.

Both are gated on `TREQ_REMOTE_E2E=1` plus provider/project credentials (see
the header comment of each file for the exact variable names). With no
credentials set, every test in both files prints a `SKIP` reason and passes
- it never fakes a passing assertion, and it never silently fails.

A third file, `src-tauri/src/core/remote_ssh_transport.rs`'s `mod tests`,
already carries (from Phase 4) - and this phase extends - native-SSH-only
coverage that runs against an in-process mock `russh::server`, not a real
provider. That coverage runs unconditionally, today, in this sandbox.

A fourth file, `src-tauri/tests/remote_ssh_server_it.rs`, runs the same
production transport against a *real*, independently implemented `sshd`
(a `linuxserver/openssh-server` container started as a job service in
`.github/workflows/remote-ssh-server-it.yml`) instead of the in-process
mock. It is gated on `TREQ_SSH_SERVER_IT=1` and connection details for a
reachable server, following the same skip-gracefully contract as the two
files above - see its own header comment for the exact variables and for
what it does and does not prove (real publickey auth, real host-key
accept/reject, real connection reuse, and real exec-channel argument
round-tripping against a stub CLI shim; not the certificate-auth half, and
not `TreqCommandRequest` payload coverage against a real Treq CLI - see
gap #11 below, which this file narrows but does not close).

## Acceptance criteria mapping

| # | Criterion | Covered by | Sandbox status |
|---|---|---|---|
| 1 | Provision exactly one managed VM with region + size | `remote_e2e.rs::provisions_instance_with_selected_region_and_size`, `::provisions_across_every_region_and_size_preset` | Gated, not run here (no `FLY_TEST_API_TOKEN`) |
| 2 | Repeated idempotency-key requests don't duplicate | `remote_e2e.rs::repeated_create_with_same_idempotency_key_does_not_duplicate_instance`; `remote_e2e.test.ts` "repeated ensure calls..." | Gated, not run here |
| 3 | Bootstrapped to declared versions, passes expanded readiness | `remote_e2e.test.ts` "provisions with a selected region and size preset and reaches ready" (polls to `ready`) | Gated, not run here |
| 4 | Client authenticates with user key + short-lived cert, no Treq-generated key | `remote_e2e.test.ts` "issues a short-lived certificate...", "...bounded, short expiry" | Gated, not run here |
| 5 | Rejects unknown/changed host key | `remote_ssh_transport.rs::host_key_verifier_rejects_mismatched_fingerprint`, `::host_key_verifier_rejects_when_no_trusted_keys_are_recorded`, `::exec_command_rejects_unknown_host_key[_and_records_mismatch]` | **Runs today, passes** (in-process mock server, no vendor needed) |
| 6 | Native SSH transport reuses a connection for multiple commands | `remote_ssh_transport.rs::exec_command_returns_stdout_and_reuses_pooled_connection` | **Runs today, passes** |
| 7 | Register a fully explicit user-owned VM endpoint | Not in this phase's scope directly - covered by Phase 1/3 control-plane unit tests (`remote_control_plane.rs`, `remote-ssh-trust/index.ts` unit-style handlers). Phase 8 adds no new test here because no real vendor call is involved. | Out of Phase 8 scope |
| 8 | Explicit SSH alias for user-owned endpoint, no auto-trust | Same as #7 | Out of Phase 8 scope |
| 9 | Multiple repositories on one managed VM | Requires a real provisioned VM to open more than one repo against; not exercised by any test in this PR. | **Gap - not implemented** (see "Known gaps" below) |
| 10 | Remote workspaces/changes/diffs/commits/conflicts render in existing UI | UI-level, out of this backend-test-infrastructure phase's scope (Phase 6). | Out of Phase 8 scope |
| 11 | Structured mutations execute through typed Treq CLI commands | Requires a real VM with the Treq CLI installed; scaffolded as documented, gated Deno test would need a real VM's SSH endpoint, which this suite does not yet drive end-to-end (see "Known gaps"). | **Gap - not implemented** |
| 12 | Shell/agent PTYs start in the selected remote workspace | `remote_ssh_transport.rs::pty_open_and_close_record_start_and_exit_counts` covers PTY start/exit against the mock server (not a real VM's shell). | **Runs today, passes** (transport-level only) |
| 13 | Recover from vendor auto-suspension via wake/reconnect | `remote_e2e.rs::wakes_instance_from_vendor_suspension`; `remote_e2e.test.ts` "wake transitions..." | Gated, not run here. **Also a real gap**: neither test can force real vendor suspension on demand (see "Known gaps"). |
| 14 | Reprovision increments generation + explicit host-trust transition | `remote_e2e.rs::reprovision_replaces_instance_and_can_change_region_and_size`; `remote_e2e.test.ts` "reprovisioning increments the instance generation and rotates the host key" | Gated, not run here |
| 15 | Correlate lifecycle/cert/host-key/readiness/provider failures via audit, no secret/source leakage | `remote_e2e.test.ts` "lifecycle operations are correlated in audit events without leaking secrets" | Gated, not run here |
| 16 | E2E acceptance tests pass against real test-environment APIs, no orphan resources | `remote_e2e.rs::delete_instance_removes_it_from_provider_inventory`; `remote_e2e.test.ts` "delete tears down the instance...", "remote-admin cleanup path..."; `scripts/remote-e2e-cleanup.ts` | Gated, not run here |

## What actually ran and passed in this sandbox

No live Fly Sprites account, Supabase test project, or network access to
either is available here. What *did* run, for real, with no mocking of the
paths under test:

- `cargo test --test remote_e2e` - all 6 tests execute, each hits the
  `TREQ_REMOTE_E2E` gate, prints a skip reason, and passes. This proves the
  harness itself compiles and behaves correctly when credentials are absent
  (the "skip gracefully, never fake success" contract), not that the
  underlying Fly calls work.
- `cargo test --lib core::remote_ssh_transport::tests` (extended this
  phase with `exec_command_reconnects_after_pooled_connection_is_marked_dead`)
  and `core::remote_provider_sprites::tests` (extended with
  `create_instance_captures_vendor_request_id_header`) - these are real,
  unconditional tests against an in-process mock SSH server / mock HTTP
  server, and they pass.
- `deno check`/`deno lint` on `supabase/functions/tests/remote_e2e.test.ts`
  and `scripts/remote-e2e-cleanup.ts` (static checks only - no Deno test run
  was possible here, since that requires a reachable Supabase test project).

## What is real code but unexecuted here (needs credentials)

Every test in `remote_e2e.rs` and `remote_e2e.test.ts` is real code written
against real APIs (Fly Machines REST API; deployed Supabase Edge Functions
on a test project) - not stubs, not `wiremock`, not the
`REMOTE_SPRITES_STUB`/`stub-sprites-adapter.ts` path. None of it executed in
this sandbox because:

- there is no `FLY_TEST_API_TOKEN` / `FLY_TEST_APP_NAME`,
- there is no `SUPABASE_TEST_URL` / `SUPABASE_TEST_SERVICE_ROLE_KEY` /
  `SUPABASE_TEST_ANON_KEY`,
- there is no network path to either vendor from this environment.

To actually run this suite, an operator needs:

1. A disposable Fly organization/app dedicated to Treq e2e tests, and an API
   token scoped to it.
2. A dedicated Supabase *test* project (never staging/production) with the
   Phase 1-7 migrations applied and the Remote SSH Edge Functions deployed,
   its own `FLY_SPRITES_API_TOKEN` / `FLY_SPRITES_APP_NAME` / SSH CA key
   material configured as Edge Function secrets, and `REMOTE_ADMIN_API_KEY`
   set to a value also exported here as `REMOTE_ADMIN_API_KEY_TEST`.
3. Set the environment variables documented at the top of each test file and
   run:
   ```
   TREQ_REMOTE_E2E=1 cargo test --test remote_e2e -- --test-threads=1
   TREQ_REMOTE_E2E=1 deno test --allow-net --allow-env supabase/functions/tests/remote_e2e.test.ts
   ```
   `--test-threads=1` on the Rust side is a recommendation, not a
   requirement enforced by the harness itself beyond the in-process
   `TREQ_REMOTE_E2E_MAX_CONCURRENCY` cap (default 2) in `remote_e2e.rs`.
4. Periodically (e.g. daily via a scheduled CI workflow) run:
   ```
   deno run --allow-net --allow-env scripts/remote-e2e-cleanup.ts
   ```
   to remove any test resources whose per-test compensating cleanup did not
   run (process killed, container OOM, etc).

## Known gaps (not implemented in this phase)

Being direct about what is left, per the task's request for an honest
accounting:

- **Multiple repositories on one managed VM (#9)** and **typed CLI mutation
  coverage against a real VM (#11)** are not implemented. Both require a
  real provisioned VM with the Treq CLI, JJ, and Git actually installed and
  reachable over SSH - `remote_e2e.test.ts` provisions and polls to `ready`
  but does not yet open an SSH session to the resulting VM and drive
  `treq repo inspect` / `workspace list` / `changes list` / commit / diff /
  conflict / mutation commands against it. That is real, additional work
  (an SSH client in the Deno test runtime, or a companion step that shells
  out to the same Rust SSH transport used in production) that a future pass
  should add once a stable test VM image exists.
- **Terminal and agent execution against a real VM** is likewise not
  implemented for the same reason - `remote_ssh_transport.rs`'s PTY test
  proves PTY open/close mechanics against a mock server, not that a real
  VM's shell or a coding agent starts correctly in a selected workspace.
- **Forcing real vendor auto-suspension (#13)** is not implemented and
  cannot be, without either a long soak (waiting out Fly's real idle
  timer) or a Fly Sprites test-environment "force-suspend" API this harness
  does not have access to document. `wake_instance` itself is exercised for
  real; the suspend-then-wake round trip is not.
- **Valid/expired/revoked certificate acceptance against a real `sshd`**:
  `remote_e2e.test.ts` proves the control plane issues a certificate with a
  short, bounded lifetime, and that a revoked key's key cannot be reissued
  a certificate. It does not yet drive a real SSH client through the native
  Rust transport to authenticate against the real VM's real `sshd` using
  that certificate, or wait out a certificate's expiry against a live
  server. `remote_ssh_transport.rs`'s host-key tests cover the "unknown/
  changed host key" half of this against the mock server, and
  `remote_ssh_server_it.rs` now covers publickey auth plus host-key
  accept/reject against a *real* `sshd`; only the certificate-auth half
  against a live server remains a gap, since that needs a real Supabase-
  issued short-lived certificate, not a static test keypair.
- **Fly-side orphan-machine scanning** in `scripts/remote-e2e-cleanup.ts` is
  documented as a manual operator step (a `curl`/`jq` one-liner in the
  script's own comments) rather than automated, to avoid handing the
  cleanup script a Fly API token it does not otherwise need for its common
  case (deleting leaked Supabase test users and their owned rows).

None of these gaps are hidden inside a passing-looking test - each one is
either absent from the test files entirely, or (for #13) present with an
explicit code comment stating what it does and does not prove.
