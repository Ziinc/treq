---
sidebar_position: 1
---

# Under the Hood

_How Treq connects its interface, Rust backend, Jujutsu repository, and local state._

Treq is a Tauri desktop application built around Jujutsu workspaces. React renders the interface, while Rust owns repository access, local databases, file updates, and terminal processes.

## Architecture

A request passes through four layers:

```
React interface
  ↓ Tauri invoke
Command handler
  ↓
Rust core
  ↓
Jujutsu integration, SQLite, file watcher, or PTY manager
```

The frontend calls typed wrappers in `src/lib/api.ts`. Tauri routes each request to a handler in `src-tauri/src/commands`. Handlers validate input, acquire application state, and delegate work to `src-tauri/src/core`.

Core modules own workspace, commit, repository, and change behavior. Infrastructure modules handle Jujutsu, SQLite, file events, and terminal processes.

## Frontend State

TanStack Query owns server state such as workspace status, commit history, diffs, and sessions. Query invalidation reconnects repository operations to the visible interface.

React context owns settings and shared interface state. Component state holds short-lived interactions such as line selection, active review comments, and terminal tabs.

## Backend State

Tauri creates one shared application state object. Mutexes protect the application database and PTY manager. Separate managers track file watchers, repository paths for open windows, and agent dispatch.

Command handlers stay thin because the same core behavior serves more than the desktop interface. This boundary also keeps repository rules testable without a webview.

## Repository Model

Treq opens an existing Git repository and initializes Jujutsu in colocated mode. Git keeps remote compatibility, Jujutsu owns workspace and commit operations, and Treq adds application state under `.treq`.

```
{repo}/
├── .git/                   # Git objects, refs, and remote configuration
├── .jj/                    # Jujutsu repository state
└── .treq/
    ├── local.db            # Treq repository-local metadata
    └── workspaces/         # Managed Jujutsu working copies
```

Jujutsu reads and writes the colocated Git store. This lets Treq use Jujutsu's revision model while preserving Git remote workflows.

## Home and Managed Workspaces

The repository root is the **home workspace**. Treq also creates managed workspaces under `.treq/workspaces/{name}`. Each one has an independent working copy and shares history with the home repository.

Treq treats the home workspace as a valid place to inspect and commit changes. Managed workspaces add a database record with their bookmark, target bookmark, path, and rebase metadata.

## Bookmarks and Targets

Jujutsu bookmarks provide the branch-like names shown by Treq. Each managed workspace owns a bookmark and records a `target_branch`. The target can be the default branch or another workspace bookmark.

That target relationship defines a stack. It also determines the revision range used for divergence, commit history, review diffs, and merges.

## Repository Operations

The Rust backend calls `jj-lib` through Treq's Jujutsu integration layer. It does not start `jj` or `git` subprocesses for repository operations.

Treq serializes commit operations for each repository path. The lock prevents two commands from changing the same repository state at the same time.

## Remote Compatibility

Git remains the transport boundary for hosted repositories. Fetch and push operations update colocated state, then Treq asks Jujutsu to read the resulting bookmarks and revisions.

Remote changes can produce ahead, behind, diverged, or bookmark-conflict states. Treq resolves those states through workspace synchronization.

## Workspace Synchronization

Synchronization has two layers. Interface refreshes load current repository data into React. Repository synchronization updates Jujutsu bookmarks, revisions, and working copies.

## Interface Refresh

TanStack Query polls workspace status every 10 seconds and session data every 30 seconds. Changing the active workspace and completing repository operations also trigger focused reloads.

Treq contains a recursive file watcher with a one-second debounce. It ignores repository internals, dependencies, build output, and temporary editor files.

<!-- TODO: The dashboard does not currently start the file watcher. Document file events as part of the active refresh path only after the watcher is re-enabled. -->

## Target Updates

Each workspace records the bookmark it targets. Treq compares the workspace history with that target to determine whether the workspace is current.

When a target moves, Treq rebases dependent workspaces onto its new commit. It skips a workspace that already descends from the target and records the target commit used by a successful rebase.

## Stack Order

Treq processes a stack from its lowest target upward. A change near the base affects every dependent workspace, so each rebase must finish before the next one starts.

Conflicts stop the clean flow. Resolve the lowest conflict first, then update the workspaces above it against the corrected history.

## Working-Copy Safety

A rebase changes repository history before the files in every working copy have been refreshed. Treq synchronizes a working copy with its bookmark only when the working copy has no pending changes.

If pending changes exist, Treq leaves the working copy untouched. This protects those edits, but the files can remain out of date with the rebased bookmark. Commit, move, or discard the changes before retrying synchronization.

## Bookmark Conflicts

A fetch can leave a local bookmark with conflicting targets. Treq surfaces the conflict and asks you to choose the remote target before it continues.

Resolution points the bookmark at that target and rebases local-only commits onto it. Dependent workspaces can then rebase in stack order.

## Home Workspace Synchronization

After a merge, Treq can synchronize the home working copy with the target bookmark. It performs this step only when the home workspace is editing that bookmark.

The merge flow then forgets the source Jujutsu workspace and removes its Treq metadata.

## Local State and Persistence

Treq divides persistent state between an application database and a database inside each repository. Live terminal processes and temporary interface state remain in memory.

## Application Database

The application database is named `treq.db` and lives in the Tauri application data directory. It stores state that must exist before or across repository sessions.

| Data | Scope |
|---|---|
| Application settings | All repositories |
| Repository settings | One repository path |
| Last opened repository | Application |
| Viewed-file records | Workspace path and file content |
| Legacy cache records | Repository operation keys |

Repository settings use keys derived from the repository path. This lets one application database hold separate preferences for many repositories.

## Repository-Local Database

Treq creates `.treq/local.db` inside each managed repository. This database stays outside version control.

| Data | Purpose |
|---|---|
| Workspaces | Paths, bookmarks, targets, and rebase metadata |
| Agent sessions | Names, models, workspace ownership, and timestamps |
| Pending reviews | Comments and review summaries |
| Changed files | Cached workspace status |
| Workspace files | Cached file lists |
| Commit diff statistics | Cached change counts |
| Instance registry | Dispatch targets for Treq agent links |

Deleting a workspace removes its repository-local records. The application database can retain state keyed by a workspace path, such as viewed-file records.

<!-- TODO: Unify viewed-file persistence with pending reviews before documenting one retention guarantee for review progress. -->

## In-Memory State

The backend keeps PTY processes in an in-memory session manager. The frontend owns terminal scrollback, active diff state, unsaved conflict comments, and query results.

Closing Treq ends live processes and clears this state. Session metadata remains in `.treq/local.db`, but it cannot restore a terminated process or its output.

## Cache Invalidation

Repository operations invalidate related query and database cache entries. The interface then reloads changed files, commit statistics, or workspace status.

Cache records are derived data. Deleting them can cause extra work on the next load, but it does not remove commits or working-copy changes.

<!-- TODO: Publish cache lifetime and invalidation guarantees once they become a supported part of Treq's behavior. -->

## Ownership Boundaries

Git and Jujutsu own repository history. Treq's databases own interface metadata and cached views of that history. React and the PTY manager own the current application session.

This boundary determines recovery. Repository history survives without Treq, local review data requires `.treq/local.db`, and live terminal state ends with the process.

## Terminal Architecture

The Rust PTY manager starts and tracks shell processes through `portable-pty`. Process output crosses the Tauri event boundary and xterm.js renders it in React.

Agent sessions use the same terminal path. Treq builds an agent command, injects the task prompt, and starts the process in the selected workspace directory.

## Native Test Bridge

The `treq-napi` crate exposes the Rust backend as a Node native addon. Frontend integration tests replace Tauri dispatch with this bridge.

The tests render the real React application and call the same Rust core against temporary Jujutsu repositories. They exercise repository behavior without launching a desktop window.

## Concurrency Boundaries

Application state locks protect mutable resources shared by commands. Repository commit locks serialize changes to one repository path.

Long-running repository work stays behind asynchronous commands. The frontend remains responsible for loading states, invalidating queries, and presenting errors.

## Learn More

- [Workspaces](/docs/concepts/workspaces)
- [Commit Management](/docs/concepts/commit-management)
- [Agent Sessions](/docs/concepts/agent-sessions)
- [Terminal Sessions](/docs/concepts/terminal-sessions)
