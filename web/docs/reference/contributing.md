---
sidebar_position: 4
---

# Contributing

_Developer documentation for working on Treq locally._

Treq is split into a React interface, a Rust core runtime, and a test bridge used by integration tests. Most changes should start by identifying which layer owns the behavior, then adding the smallest test that proves the change.

## Repository Layout

| Path | Purpose |
|---|---|
| `src/` | React interface, hooks, shared frontend utilities, and app state providers. |
| `src-tauri/src/commands/` | Thin command handlers. Keep business logic out of this layer. |
| `src-tauri/src/core/` | Workspace, commit, repository, and change-management logic. |
| `src-tauri/src/jj.rs` | Jujutsu and Git repository integration. |
| `crates/treq-napi/` | Native test bridge used by frontend integration tests. |
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

Backend changes use test-driven development. Add a failing Rust test first, make the smallest implementation change, then rerun the test.

Frontend integration tests should exercise the real backend through the native test bridge. Do not mock repository behavior when the feature depends on workspace state, file status, commits, or rebasing.

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
```

Run `npm run build:napi` after Rust changes that integration tests depend on.

## Implementation Rules

Keep command handlers thin. Validate inputs, acquire state, and delegate to `src-tauri/src/core/`.

Prefer repository libraries over subprocess calls from Rust. Path-taking repository functions must handle missing workspace paths by returning an empty or default result where that behavior is part of the app contract.

Do not mix unrelated cleanup into feature work. Treq has several layers with different ownership boundaries, and broad refactors make regressions harder to review.

## Documentation Rules

Docs follow the local style guide in `web/STYLE_GUIDE.md`. Write direct technical prose. Avoid marketing language. Use tables for dense reference data.

Public docs should describe supported macOS behavior unless another platform is explicitly documented. Avoid exposing implementation details that users cannot act on.

## Learn More

- [Overview](/docs/)
- [CLI](/docs/reference/cli)
- [Workspaces](/learn/concepts/workspaces)
