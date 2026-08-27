# Mobile Remote Control

## Status

Planned; out of scope for the initial Remote SSH Control delivery.

## Summary

Treq plans to support mobile review and control of repositories hosted on user-managed or Treq-managed VMs through native SSH. The desktop Remote SSH Control architecture must preserve the identities, typed command protocol, host trust, certificate, and session concepts required by a future mobile client, but this PRD does not authorize mobile implementation work yet.

## Dependencies

Mobile work begins only after the requirements in [Remote SSH Control](./remote-ssh.md) are stable:

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

- Connect to an explicitly configured endpoint using a native mobile SSH library.
- Keep private keys in platform-protected device storage.
- Verify pinned server host keys.
- Use short-lived certificates for managed instances.
- Review workspaces, changes, diffs, file context, commits, and conflicts.
- Start, inspect, attach to, and stop remote coding agents.
- Perform a deliberately limited set of safe, confirmed mutations.
- Recover cleanly from app suspension and network changes.

## Non-goals for initial mobile work

- Provisioning implementation owned by the mobile app; provisioning remains a control-plane API.
- Port forwarding.
- Filesystem mounting.
- Storing private keys in Supabase.
- Arbitrary background SSH execution when prohibited by the operating system.
- Treating the mobile device as the source of truth for repository state.
- Automatically importing or trusting arbitrary mobile SSH profiles.

## Planned architecture

```text
Mobile Treq
  ├─ Supabase authentication and control-plane API
  ├─ platform key storage
  └─ native SSH client
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

### Phase 1: Security and connectivity prototype

- Authenticate to the control plane.
- Register a mobile device public key.
- Obtain a short-lived managed-instance certificate.
- Verify the pinned host key.
- Connect with a native SSH library.
- Execute repository inspection and display structured errors.

### Phase 2: Read-only review

- Instance and repository selection.
- Workspace list and status.
- Changed files and structured diffs.
- Working-copy and parent file context.
- Commit and conflict views.
- Manual refresh and stale-state presentation.

### Phase 3: Agent control

- Start an agent in a selected workspace.
- Send input and respond to permission requests.
- Read status and bounded logs.
- Reattach after app suspension.
- Stop a running agent.

### Phase 4: Controlled mutations

- Workspace creation and rebase.
- Patch application.
- Commit creation.
- Conflict resolution.
- Bookmark push with explicit confirmation.

### Phase 5: Mobile test infrastructure

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
