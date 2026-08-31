# Mobile Remote Control

## Status

Phase 2 in progress. Treq ships as a Tauri application; mobile support extends the existing Tauri build to the Android and iOS targets instead of a separate native client. The app renders a distinct, touch-first mobile layout on those targets, backed by the same Rust core and Tauri IPC commands the desktop app uses. Phase 1 (build targets, mobile shell) is done; Phase 2 (device key registration, certificate issuance, SSH connectivity) has a working prototype path, gated on real platform-keystore storage before it can ship - see Phase 2 below.

## Summary

Treq mobile is the same Tauri application (same Rust core, same `src-tauri` commands, same `lib/api.ts` surface) compiled for Android and iOS via `tauri android` / `tauri ios`. Mobile does not get a reduced command set: any capability exposed to the desktop `Dashboard` is reachable from the mobile client too. What differs is presentation — a single-column, touch-first shell (`MobileShell`) replaces the desktop's multi-pane `Dashboard` when the app detects a mobile viewport, the same way `useIsMobile` already switches other components.

Remote review of VM-hosted repositories over SSH (see [Remote SSH Control](./remote-ssh.md)) remains a separate, larger capability that mobile will consume once it lands, but it is not a precondition for shipping a mobile build: a mobile build can review and operate on repositories reachable the same way the desktop app reaches them today.

## Dependencies

Phase 1 (this PRD) only requires:

- Android and iOS build tooling for the existing Tauri app (Android SDK/NDK, Xcode, `tauri android init` / `tauri ios init`).
- A mobile-scoped Tauri capability set (`src-tauri/capabilities/mobile.json`) distinct from the desktop capability set (no multi-window, no CLI plugin).
- A mobile-specific top-level layout in the React app.

Later phases that add remote-VM review and control depend on the requirements in [Remote SSH Control](./remote-ssh.md) being stable:

- provider-neutral endpoint and repository identities;
- strict host-key verification;
- user-owned private keys and independently revocable public-key records;
- short-lived SSH certificates for Treq-managed VMs;
- allow-listed Treq CLI requests and stable JSON errors;
- complete remote review APIs;
- remote mutations with idempotency;
- durable agent lifecycle commands where required;
- observable, bounded SSH operations.

## Goals

- Build and ship Treq for Android and iOS from the existing Tauri codebase, no fork.
- Detect a mobile viewport/platform and render `MobileShell` instead of the desktop `Dashboard`.
- Expose the same Tauri commands (`lib/api.ts`) to the mobile layout that the desktop layout uses.
- Scope mobile permissions with a dedicated Tauri capability file, dropping desktop-only capabilities (multi-window, CLI plugin) that don't apply on mobile.
- Once Remote SSH Control is stable, connect to an explicitly configured endpoint using a native mobile SSH library, keep private keys in platform-protected device storage, verify pinned server host keys, and use short-lived certificates for managed instances.
- Review workspaces, changes, diffs, file context, commits, and conflicts from a touch-first layout.
- Start, inspect, attach to, and stop remote coding agents.
- Perform a deliberately limited set of safe, confirmed mutations.
- Recover cleanly from app suspension and network changes.

## Non-goals for initial mobile work

- A separate mobile codebase or a rewrite in a different framework.
- Provisioning implementation owned by the mobile app; provisioning remains a control-plane API.
- Port forwarding.
- Filesystem mounting.
- Storing private keys in Supabase.
- Arbitrary background SSH execution when prohibited by the operating system.
- Treating the mobile device as the source of truth for repository state.
- Automatically importing or trusting arbitrary mobile SSH profiles.

## Planned architecture

```text
Treq (single Tauri app, shared Rust core + React frontend)
  ├─ desktop targets (macOS/Windows/Linux)
  │    └─ Dashboard layout (multi-pane)
  └─ mobile targets (Android/iOS, via `tauri android` / `tauri ios`)
       └─ MobileShell layout (single-column, touch-first)
                 ↓ (same src-tauri commands on every target)
  ├─ local repository access (jj/git on-device or synced workspace)
  └─ once Remote SSH Control lands: native SSH client
       ├─ structured exec channels
       └─ interactive PTY channels
                 ↓
       User-managed or Treq-managed VM
         ├─ SSH server
         ├─ Treq CLI
         ├─ optional local agent supervisor
         └─ repositories and agents
```

## Mobile-specific concerns

### Key custody

The device creates or imports its key outside Treq's control-plane infrastructure. Private material remains in Keychain, Secure Enclave, Android Keystore, or equivalent protected storage. Supabase stores only the public key and device metadata.

### Host trust

Managed endpoint fingerprints come from the authenticated control plane. User-managed endpoints require explicit fingerprint configuration or an interactive first-trust flow that clearly distinguishes verification from convenience.

### App lifecycle

Mobile operating systems may suspend the app and close sockets. Structured operations must be bounded and safely retryable. Mutations use idempotency keys. Agent processes that must survive disconnects run under a VM-local supervisor and are reattached by session ID.

### Connection efficiency

One authenticated SSH connection should multiplex repository commands and PTY channels while the app is active. The implementation must avoid reconnecting for every file or diff request.

### Terminal UX

Terminal access is secondary to structured review and agent control. It requires mobile keyboard handling, resize behavior, binary-safe streaming, explicit connection state, and a clear statement when a session cannot be resumed.

## Candidate capability requirements

Any selected mobile SSH library must be evaluated for:

- supported platforms and license;
- active maintenance and vulnerability response;
- host-key verification callbacks;
- supported key algorithms;
- OpenSSH user certificates;
- platform key storage integration;
- connection and channel multiplexing;
- exec and PTY channels;
- terminal resize;
- keepalives and reconnect;
- cancellation and deadlines;
- memory and output limits;
- proxy support only if later required.

## Phased plan

### Phase 1: Build system and mobile shell (done)

- Add Android and iOS as Tauri build targets (`tauri android init` / `tauri ios init`, npm scripts, mobile app icons).
- Add a mobile-scoped Tauri capability file (`src-tauri/capabilities/mobile.json`).
- Add `MobileShell`, a touch-first top-level layout, and switch to it on mobile viewports via `useIsMobile`.
- Wire `MobileShell` to existing Tauri commands (e.g. `get_workspaces`) to prove the same IPC surface works unmodified on mobile.

### Phase 2: Security and connectivity prototype (this delivery)

The desktop app already has a real control-plane client (`lib/remote-control-plane.ts`), the `remote-ssh-trust` and `remote-instance` edge functions, and a russh-based native SSH transport with pinned host-key verification (`core::remote_ssh_transport`) reachable through `dispatchOverSsh`. None of that is SSH-library-prototype work mobile needs to redo - `russh` is pure Rust and compiles into the same mobile binary. What mobile Phase 2 adds is the piece desktop doesn't need: a way for a device with no `~/.ssh` to get a keypair and use it.

Done in this delivery:

- Authenticate to the control plane (reuses the existing Supabase auth session - no mobile-specific work needed).
- Generate and persist a per-device ed25519 keypair (`core::remote_device_key`, `ensure_mobile_device_key` command, `ensureMobileDeviceKey()`), since mobile has no `~/.ssh` identities to pick from.
- Register the device public key with the control plane (`registerClientKey`, wired to the previously-unused `register_client_key` edge function action).
- Obtain a short-lived managed-instance certificate (`issueCertificate`, wired to `issue_certificate`).
- Verify the pinned host key and connect with the native (russh) SSH library - reused as-is from the existing transport; the certificate response's `endpoint.host_keys` feeds the same `HostKeyVerifier` desktop uses.
- Execute repository inspection (`ProbeRepo` over `dispatchOverSsh`) and display structured errors - `RemoteConnectPanel` in `MobileShell`.

Open item before this can ship as more than a prototype: the device private key is currently written to the app's local data directory with owner-only file permissions where the OS supports them (see `core::remote_device_key` doc comment). That is not yet the platform-protected storage (Android Keystore / iOS Keychain or Secure Enclave) the PRD's goals require, and Tauri has no first-party plugin for that today. Closing this gap - via a small native plugin or `tauri-plugin-stronghold` if it proves suitable for both mobile targets - is required before Phase 2 is more than a connectivity prototype.

### Phase 3: Read-only review

- Instance and repository selection.
- Workspace list and status.
- Changed files and structured diffs.
- Working-copy and parent file context.
- Commit and conflict views.
- Manual refresh and stale-state presentation.

### Phase 4: Agent control

- Start an agent in a selected workspace.
- Send input and respond to permission requests.
- Read status and bounded logs.
- Reattach after app suspension.
- Stop a running agent.

### Phase 5: Controlled mutations

- Workspace creation and rebase.
- Patch application.
- Commit creation.
- Conflict resolution.
- Bookmark push with explicit confirmation.

### Phase 6: Mobile test infrastructure

- Real control-plane test project.
- Real provider test instances.
- Device key and certificate issuance tests.
- Host-key mismatch and rotation tests.
- Network transition and app suspension tests.
- Idempotent mutation retry tests.
- Resource cleanup and cost controls.

## Acceptance criteria for a future mobile MVP

1. A mobile client can authenticate, select an authorized instance, and retrieve trusted endpoint metadata.
2. The private key never leaves protected device storage.
3. The client rejects a mismatched host key.
4. The client authenticates to a managed VM with a short-lived certificate.
5. The client renders remote workspace and review data without cloning the repository locally.
6. A structured mutation can be retried without duplicate effects.
7. An agent started on the VM remains observable after the mobile app reconnects.
8. Losing or revoking one device does not revoke other registered devices.

## Open questions

- Which native SSH library meets the certificate, host verification, PTY, and platform-security requirements?
- Can hardware-backed keys be used directly by the chosen SSH library on both mobile platforms?
- Which agent interactions require push notifications?
- Which mutations are safe and ergonomic enough for the first mobile release?
- What terminal functionality is necessary beyond structured agent control?
