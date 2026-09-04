# `remote_ssh_server_it` fixtures

`id_ed25519` / `id_ed25519.pub` is a throwaway ed25519 keypair used only by
`.github/workflows/remote-ssh-server-it.yml` to authenticate against the
`linuxserver/openssh-server` container that workflow starts as a job
service. It is **not a secret**:

- it is never used against any real host, only against an ephemeral,
  network-isolated container that exists for the duration of one CI job and
  is discarded afterward;
- the workflow authorizes this exact public key on that container and no
  other; the private key grants no access anywhere else.

It is committed here (rather than generated fresh per run) so the workflow
can hardcode the matching public key directly in the `services:` block,
where GitHub Actions cannot read step outputs or files at service-start
time.

The user CA private key and the certificate-only client key are **not**
committed. The workflow generates them per job under `$RUNNER_TEMP`,
installs only the CA *public* key as `TrustedUserCAKeys` on the container,
and never uploads private material as an artifact. The cert-only client
key is kept out of `authorized_keys` so certificate tests cannot succeed
via ordinary publickey auth.

See `src-tauri/tests/remote_ssh_server_it.rs` for what is proven against
this server.

If the bootstrap key is ever rotated, regenerate both files with:

```
ssh-keygen -t ed25519 -N "" -C "treq-ci-remote-ssh-it (test-only, no real access)" -f id_ed25519
```

and update the `PUBLIC_KEY` value in the workflow to match the new
`id_ed25519.pub`.
