---
sidebar_position: 2
---

# Security and Privacy

_How Treq handles your data, what it never sends, and which operations the CLI refuses to perform._

Treq is a local desktop application. Repository data, workspace metadata, and settings stay on your machine. The base application does not upload your code or usage data to Treq servers.

## Local Data

The base Treq application stores nothing on remote servers. Workspace checkouts, review comments, terminal session metadata, and app preferences live in local files on your computer.

Repository history remains in your Git and Jujutsu stores. Treq metadata lives under `.treq` inside the repository and in the application data directory. See [Under the Hood](/docs/under-the-hood) for the storage layout.

If you push or fetch through Treq, Git talks to your configured remotes. That traffic goes to those hosts, not to Treq.

## Telemetry

Treq does not collect telemetry. The application does not send feature usage, crash reports, or performance metrics to Treq or any third party.

Local logs can exist on disk for debugging. They stay on your machine and are not uploaded.

## CLI Safety

The `treq` CLI is non-destructive. It can create and inspect workspaces, move changes, and start agent sessions. It does not delete workspaces. It does not force-push to remotes.

Workspace deletion stays in the desktop UI, where you confirm context before removing local state. Push behavior through the app follows normal Git remote rules. The CLI has no force-push path.

## Website Analytics

The documentation site at treq.dev uses Google Analytics to measure traffic. IP addresses are anonymized before Google records them.

This analytics applies only to the website. Visiting the docs does not connect to your local Treq install or repositories.

## Open Source

Treq is fully open source. You can read every line of the desktop app, CLI, and documentation site in the [public repository](https://github.com/Ziinc/treq).

Audit the code yourself, or follow the public history of changes. Claims about local storage, telemetry, and CLI behavior are verifiable in source.

## Learn More

- [Under the Hood](/docs/under-the-hood)
- [CLI](/docs/reference/cli)
- [Contributing](/docs/reference/contributing)
