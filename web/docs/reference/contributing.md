---
sidebar_position: 4
---

# Contributing

_Developer documentation for working on Treq locally._

Treq splits into a React interface, a Rust core runtime, and a test bridge the integration tests use. Start any change by working out which layer owns the behavior, then write the smallest test that proves your change.

## Repository Layout

| Path | Purpose |
|---|---|
| `src/` | React interface, hooks, shared frontend utilities, and app state providers. |
| `src-tauri/src/commands/` | Thin command handlers. Keep business logic out of this layer. |
| `src-tauri/src/core/` | Workspace, commit, repository, and change-management logic. |
| `src-tauri/src/jj.rs` | Jujutsu and Git repository integration. |
| `src-tauri/` with `--features tauri-test` | Native test bridge (`tauri-test`) used by frontend integration tests. |
| `test/` | Vitest unit and integration tests. |
| `web/` | Documentation site. |

## Development Setup

Install dependencies from the repository root.

```bash
npm install
```

Run the desktop app in development mode.

```bash
npm start
```

Run the documentation site from `web/`.

```bash
npm start
```

## Test Strategy

Backend changes are test-first. Write a failing Rust test, make the smallest change that passes it, then run it again.

Frontend integration tests should hit the real backend through the native test bridge. Do not mock repository behavior when the feature leans on workspace state, file status, commits, or rebasing.

| Change type | Test location |
|---|---|
| Core Rust behavior | Inline tests next to the Rust module. |
| Command behavior | Command tests plus integration coverage when user-visible. |
| React behavior | `test/` for focused UI logic, `test/integration/` for workspace flows. |
| Documentation | Markdown lint and local docs preview. |

## Common Commands

```bash
npm run build:napi
npm run test:run
npm test
cargo test --manifest-path src-tauri/Cargo.toml
npm run screenshot:readme
```

Run `npm run build:napi` after Rust changes that integration tests depend on.

`npm run screenshot:readme` (alias `npm run screenshot:landing`) captures the overview shot at `assets/screenshots/code.png` and the site shots under `web/static/img/`. Site shots stay out of git. The Deploy Web workflow generates them in the `landing-screenshots` job. The docs job then copies those PNGs into `web/static/img` (`/img/code.png` and `/img/landing/*`) before `docusaurus build`.

Set `SKIP_LANDING_SCREENSHOTS=1` on docs-only CI so the site build does not recapture. Set `FORCE_LANDING_SCREENSHOTS=1` to recapture even when files already exist.

## Implementation Rules

Keep command handlers thin. Check the input, take the state you need, and hand the work to `src-tauri/src/core/`.

Call repository libraries instead of shelling out from Rust. A repository function that takes a path must cope with a workspace path that is not there, returning an empty or default result wherever the app promises that.

Do not fold unrelated tidying into feature work. Treq has several layers with different owners, and a wide refactor makes a regression much harder to spot.

## Documentation Rules

Docs follow the style guide in `web/STYLE_GUIDE.md`. Write plain technical prose, skip the marketing language, and use tables for dense reference data.

Public docs describe macOS, Windows, and Linux behavior. Call out platform-specific behavior when it differs. Leave out implementation details a reader cannot act on.

## Learn More

- [Overview](/docs/)
- [CLI](/docs/reference/cli)
- [Workspaces](/docs/concepts/workspaces)
