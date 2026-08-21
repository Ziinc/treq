# Treq Agent Guide

## Overview

Treq is a full-stack **Tauri v2** Stacking Agent Development Environment (ADE) built on Jujutsu (jj). The frontend is React/TypeScript rendered in a WebView; the backend is Rust, exposed to the frontend via Tauri commands. A native Node addon (NAPI) bridges the two sides for testing.

---

## Repository Layout

```
treq/
├── src/                    # React/TypeScript frontend
│   ├── components/         # UI components (Dashboard, ShowWorkspace, etc.)
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Utilities, API wrappers, git helpers
│   └── types/              # Shared TypeScript types
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── commands/       # Tauri command handlers (thin layer)
│   │   ├── core/           # Business logic (workspaces, commits, repo, changes)
│   │   ├── tauri_test_bridge.rs  # N-API test helpers (feature `tauri-test`)
│   │   ├── jj.rs           # Jujutsu VCS integration
│   │   ├── db.rs           # SQLite via rusqlite
│   │   └── pty.rs          # Terminal management (portable-pty)
│   ├── benches/            # Criterion performance benchmarks
│   └── tests/              # Rust integration test helpers
└── test/                   # Frontend test suite
    ├── integration/        # Full-stack integration tests (real Rust backend)
    ├── factories/          # Test data factories
    ├── mocks/              # UI library mocks (popover, cmdk, dialog)
    ├── setup.common.ts     # DOM polyfills, Tauri API stubs
    ├── setup.integration.ts # NAPI dispatch setup
    └── test-utils.tsx      # customRender(), screen helpers
```

---

## App Architecture

### Frontend

**React 18** with no client-side router. Navigation is URL-search-param driven (`?repo=...`) and sidebar-based.

**State management** — two layers:
- **TanStack Query** for all async server state (Tauri commands, file watching, commit history)
- **Zustand** for ambient client state (theme, zoom, diff/terminal settings, auth, editor apps, toasts, treq-send). Components select from `use*Store` directly. `AppStoreEffects` hydrates settings and attaches DOM/Tauri listeners. `ToastProvider` is a viewport over the toast store.

**Key components:**
| Component | Responsibility |
|---|---|
| `Dashboard` | Root container; sets up providers, repo URL param, file watcher |
| `ShowWorkspace` | Active workspace view — staging, diff, commit |
| `ChangesDiffViewer` | Diff display and hunk staging |
| `FileBrowser` | File tree navigation |
| `LinearCommitHistory` | Commit log in sidebar |
| `Terminal` | Embedded terminal (xterm.js) |

### Backend (Rust)

**Tauri commands** (`src-tauri/src/commands/`) are thin handlers. They validate input, acquire state locks, and delegate to **core modules**.

**Core modules** (`src-tauri/src/core/`) contain all business logic:
- `workspaces.rs` — workspace lifecycle (create, merge, sync, delete)
- `commits.rs` — commit creation and manipulation
- `repo.rs` — repository-level operations
- `changes.rs` — change tracking and diffing

**Infrastructure:**
- `jj.rs` — all Jujutsu CLI/library calls (largest module)
- `db.rs` / `local_db.rs` — SQLite for workspace metadata
- `pty.rs` — portable PTY for the embedded terminal

**Thread-safety contract** — `AppState` wraps mutable resources in `Mutex`:
```rust
struct AppState {
    db: Mutex<Database>,
    pty_manager: Mutex<PtyManager>,
    watcher_manager: WatcherManager,
    window_repo_paths: Mutex<HashMap<String, String>>,
}
```

### NAPI Bridge

The `src-tauri` library is compiled with the `tauri-test` feature to a native addon. Tests `require("../src-tauri/target")` so `invoke` runs real Rust commands without launching a desktop window.

---

## Testing Architecture

### Test Stack

| Layer | Tool | Location |
|---|---|---|
| Frontend unit | Vitest + React Testing Library | `test/*.test.ts(x)` |
| Frontend integration | Vitest + RTL + real Rust via NAPI | `test/integration/**/*.test.tsx` |
| Rust unit | Built-in `#[cfg(test)]` | inline in each `.rs` file |
| Rust benchmarks | Criterion | `src-tauri/benches/` |

### Running Tests

```bash
# Full test suite (builds NAPI first)
npm test

# Frontend tests only (requires prior napi build)
npm run test:run

# Rebuild the tauri-test addon (required after any Rust change)
npm run build:napi

# Rust unit tests
cargo test --manifest-path src-tauri/Cargo.toml
```

### Integration Test Pattern

Each integration test:
1. Creates a real jj repository via NAPI (`createTestRepo`)
2. Sets the active repo URL param (`openRepo`)
3. Renders `<Dashboard />` — Tauri `invoke` is replaced with NAPI dispatch
4. Drives UI via `userEvent`
5. Asserts DOM state

```typescript
describe("workspace header", () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    const { repoPath } = createTestRepo(false);
    openRepo(repoPath);
    user = userEvent.setup();
  });

  it("switches branch on click", async () => {
    await createWorkspace(repoPath, "feat/thing");
    render(<Dashboard />);
    await user.click(await findSidebarBranchElement("feat/thing"));
    expect(await screen.findByText("feat/thing")).toBeTruthy();
  });
});
```

### Rust Test Pattern

Unit tests live inline next to the code they test:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn parses_conflict_marker_correctly() {
        let input = "<<<<<<< ...\ncontent\n>>>>>>> ...";
        assert!(has_conflict_markers(input));
    }
}
```

Benchmark helpers (`src-tauri/tests/e2e_test_helpers.rs`) provide `TestRepo` — a real jj repo in a `TempDir` — shared across all Criterion benchmarks.

---

## TDD Strategy (Required)

All backend Rust work **must** follow Test-Driven Development. Frontend integration work should also follow TDD where a test can be written before the feature.

### The TDD Loop

```
1. Write a failing test that captures the desired behaviour
2. Run tests — confirm the new test fails (and only the new test)
3. Write the minimum code to make it pass
4. Run tests — confirm all pass
5. Refactor while keeping tests green
```

Never write implementation code before the test exists. If you are fixing a bug, reproduce it in a test first.

### Where to Put Tests

| Work type | Test location | Framework |
|---|---|---|
| New Rust core function | Inline `#[cfg(test)]` module in same `.rs` file | `#[test]` |
| New Tauri command | Inline `#[cfg(test)]` in `commands/*.rs` + integration test in `test/integration/` | `#[test]` + Vitest |
| New React component | `test/integration/` for behaviour; `test/*.test.tsx` for isolated logic | Vitest + RTL |
| Utility / pure function | `test/*.test.ts` | Vitest |
| Performance-critical path | `src-tauri/benches/` | Criterion |

### Writing Good Tests

**Rust unit tests — checklist:**
- Use `tempfile::TempDir` for any filesystem operations; never hardcode paths
- Test one behaviour per `#[test]` function
- Name tests as `verb_noun_condition`: `creates_workspace_with_empty_dir`, `returns_error_when_path_missing`
- Use `assert_eq!` / `assert!` directly; avoid custom assertion helpers unless shared across many tests

**Frontend integration tests — checklist:**
- Always start from `createTestRepo()` — never share repo state between tests
- Render `<Dashboard />` rather than individual components so the full provider tree is exercised
- Use `userEvent` (not `fireEvent`) to simulate real interaction
- Prefer `screen.findBy*` (async) over `getBy*` for elements that appear after Rust calls resolve
- Assert visible text or ARIA roles — not internal state or implementation details
- Keep `beforeEach` minimal; move complex repo setup into the test itself or a shared helper

**What not to do:**
- Do not mock the Rust backend in integration tests — use the real NAPI dispatch
- Do not share mutable repo state across test cases
- Do not test implementation details (internal state, private functions called) — test observable behaviour
- Do not skip the failing step: a green test written before code is a false test

### Benchmark Guidance

Add a Criterion benchmark in `src-tauri/benches/` for hot paths (file save, keystroke, large diffs). Use `BatchSize::PerIteration` with `TestRepo` to isolate each iteration.

---

## Workflow Rules

- Use **npm** (not pnpm) for all JS commands
- Keep commands layer thin: no business logic in `commands/*.rs` — delegate to `core/`
- Never write commits; the user owns all VCS operations
- Prefer **jj-lib** or **gix** over subprocess calls; never shell out to `jj` or `git` from Rust
- `jj.rs` functions that accept a workspace path must validate the path exists and return an empty/default value on missing path rather than propagating an IO error
