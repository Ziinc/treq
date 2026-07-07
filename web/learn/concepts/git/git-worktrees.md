---
sidebar_position: 1
---

# Git Worktrees

## 1. Quick Summary

A Git worktree is an additional working directory linked to the same repository. Instead of switching branches in one folder — stashing, committing, or abandoning in-progress work — you check out each branch in its own directory while sharing a single `.git` object store.

Worktrees matter because branch switching is expensive in time and attention. Developers who juggle features, reviews, hotfixes, and AI agent tasks need parallel working directories without the disk and sync overhead of multiple clones.

Anyone who works on more than one branch at a time should understand worktrees: solo developers, reviewers, platform engineers running CI-adjacent tasks, and teams orchestrating multiple AI coding agents.

---

## 2. The Problem

### What pain exists?

A standard Git repository has one working tree — the directory where files are checked out and your editor runs. Checking out a different branch rewrites every tracked file in that directory. If you are mid-task on a feature branch and need to review a pull request, reproduce a production bug, or run a long test suite on another branch, you must first deal with your current state: stash it, commit it, or discard it.

### Why do developers search for this?

The search usually starts with a specific moment: a hotfix lands while feature work is half-finished, a reviewer asks for a local checkout of a PR, or a test run blocks the only directory you have. The underlying question is always the same — *how do I work on two branches at once without losing context?*

### Common symptoms

- Frequent `git stash` / `git stash pop` cycles that corrupt mental state
- Half-committed WIP commits created just to switch branches
- Abandoned local experiments because switching back felt too costly
- One terminal blocked by a 20-minute test run while other work waits
- AI agents overwriting each other's changes in a shared checkout

### Why this gets worse with AI-assisted development

Coding agents need an isolated working directory to run autonomously. When multiple agents — or an agent and a human — share one checkout, they compete for the same files, branch, and index. An agent mid-refactor can block your hotfix. Your uncommitted edits can confuse an agent's file reads.

The cost of context switching used to be mostly human. With agents, it is also computational: restarting an agent, re-scoping a task, or re-running a failed session because the working tree changed underneath it.

---

## 3. Core Concept

### Mental model

Think of a Git repository as two layers:

1. **The database** — objects, refs, config, and history stored in `.git`
2. **The working tree** — the files on disk you actually edit

A normal clone has one of each. `git worktree add` creates additional working trees that all read and write the same database. A commit in any worktree is immediately visible everywhere.

```
your-repo/                    ← main worktree (branch: feature/auth)
├── .git/                     ← shared object store, refs, config
├── src/
└── ...

your-repo-hotfix/             ← linked worktree (branch: hotfix/login-bug)
├── src/                      ← own checked-out files
└── .git  →  file pointing back to ../your-repo/.git
```

### Terminology

| Term | Meaning |
|---|---|
| **Main worktree** | The original checkout created when you cloned or initialized the repo |
| **Linked worktree** | An additional checkout created with `git worktree add` |
| **Working tree** | The directory of checked-out files for a given worktree |
| **Index** | Each worktree has its own staging area |
| **HEAD** | Each worktree points to its own branch |

### Relationship to adjacent concepts

- **Branches** define lines of history; worktrees let you materialize multiple branches on disk simultaneously
- **Clones** also give you multiple working directories, but duplicate the object store and ref namespace — see [Git Worktrees vs Clones](./git-worktrees-vs-clones)
- **Workspaces** (in tools like Treq or Jujutsu) are higher-level abstractions that often map to worktrees under the hood
- **Stacked PRs** benefit from worktrees when each PR in the stack needs its own checkout for review or amendment — see [What are Stacked PRs?](./stacked-prs)

---

## 4. How It Works

### Creating a worktree

```bash
# Create a worktree at ../hotfix, branching from origin/main
git worktree add ../hotfix origin/main -b hotfix/critical-bug

# List all worktrees
git worktree list

# Remove a worktree when done
git worktree remove ../hotfix
```

### What each worktree owns vs shares

| Owns (per worktree) | Shares (across all worktrees) |
|---|---|
| Checked-out files | Commits and objects |
| `HEAD` (current branch) | Branches and tags (refs) |
| Index (staging area) | Remote configuration |
| Uncommitted changes | Git hooks (run in triggering worktree's context) |
| Current working directory | Stash |

### Lifecycle timeline

```
t=0   Clone repo → one worktree on main
t=1   git worktree add ../feature-a -b feature/a   → two worktrees
t=2   Commit in ../feature-a                        → commit visible in both
t=3   git worktree add ../review-pr-42 pr-42-branch → three worktrees
t=4   Merge feature/a, git worktree remove ../feature-a → back to two
```

### Git-enforced constraints

- **One branch per worktree** — you cannot check out the same branch in two worktrees. Git prevents diverging `HEAD` states on the same ref.
- **Shared stash** — stashing in one worktree and popping in another works, but is rarely intentional.
- **Hooks run per worktree** — pre-commit and other hooks execute in the context of the worktree that triggered the operation.

---

## 5. Practical Example

### Scenario

You maintain `acme-api`, a backend service. You are implementing `feature/rate-limiting` in your main checkout. Production reports a login regression. A colleague's PR (`pr/42-oauth-refresh`) needs your review. You also want to spin up a coding agent to draft the rate-limiting tests in parallel.

### Setup

```bash
# Main checkout — your feature work continues here
cd ~/code/acme-api          # branch: feature/rate-limiting

# Hotfix worktree — reproduce and fix the login bug
git worktree add ../acme-api-hotfix origin/main -b hotfix/login-regression

# PR review worktree — check out colleague's branch locally
git fetch origin pull/42/head:pr/42-oauth-refresh
git worktree add ../acme-api-pr42 pr/42-oauth-refresh

# Agent worktree — isolated sandbox for test generation
git worktree add ../acme-api-agent feature/rate-limiting -b feature/rate-limiting-tests
```

### Parallel workflow

| Worktree | Branch | Who works here | Task |
|---|---|---|---|
| `acme-api` | `feature/rate-limiting` | You | Core implementation |
| `acme-api-hotfix` | `hotfix/login-regression` | You | Fix and open PR |
| `acme-api-pr42` | `pr/42-oauth-refresh` | You | Review, run tests |
| `acme-api-agent` | `feature/rate-limiting-tests` | AI agent | Draft test suite |

You fix the hotfix in `acme-api-hotfix`, push, and open a PR — without touching your rate-limiting edits. You review PR #42 in `acme-api-pr42` with a real local build. The agent runs in `acme-api-agent` without reading your half-finished implementation files.

When the hotfix merges, you rebase `feature/rate-limiting` in your main checkout. The agent's test branch can be rebased or merged into your feature branch after review.

Tools like [Treq](/learn/tutorials/managing-workspaces) automate this pattern: each workspace maps to a directory under `.treq/workspaces/` with its own branch, managed from a single dashboard.

---

## 6. Benefits

Focus on outcomes, not mechanics:

- **Faster reviews** — check out a PR branch locally without disturbing in-progress work
- **Fewer stash-and-forget accidents** — no more buried stashes from interrupted context switches
- **Easier parallel work** — run a long test suite in one directory while coding in another
- **Reduced context switching** — each task keeps its own editor, terminal, and mental frame
- **Safer AI-generated changes** — each agent gets an isolated directory; completed work is reviewed before merging
- **Lower disk and sync cost than clones** — shared object store means no redundant history copies
- **Immediate cross-worktree visibility** — a commit in one worktree is instantly available in all others

---

## 7. Trade-offs

Worktrees are not free. Every engineering decision has costs:

| Cost | Detail |
|---|---|
| **Complexity** | You now manage multiple directories, not one. `git worktree list` becomes part of your routine. |
| **Cognitive load** | It is easy to forget which directory corresponds to which task, especially with similar names. |
| **Shared configuration** | All worktrees share remotes, hooks, and `.git/config`. You cannot easily use different credentials per worktree. |
| **Branch exclusivity** | One branch, one worktree. Checking out `main` in a second worktree requires a different ref (e.g., `origin/main` detached). |
| **Cleanup discipline** | Orphaned worktree directories accumulate. Stale worktrees consume disk for working trees even after branches merge. |
| **Tooling assumptions** | Some tools assume a single checkout per repo. IDEs, file watchers, and language servers may need per-worktree configuration. |

Worktrees trade simplicity for concurrency. That trade is worth it when parallel work is frequent; it is not worth it when you rarely leave your current branch.

---

## 8. Failure Modes

### Checking out the same branch twice

```bash
git worktree add ../second feature/auth
# fatal: 'feature/auth' is already checked out at '/path/to/main-checkout'
```

**Recovery:** Use a different branch name, or remove the existing worktree that holds the branch.

### Forgetting to remove merged worktrees

After merging `hotfix/login-regression`, the `acme-api-hotfix` directory still exists on disk. It serves no purpose but looks like active work.

**Recovery:** `git worktree remove ../acme-api-hotfix` (or `git worktree prune` for stale entries).

### Agents sharing a worktree

Two agents writing to the same directory produce interleaved, conflicting edits. The failure looks like a bad merge, but there was never a merge — just concurrent writes.

**Recovery:** Give each agent its own worktree. If damage is done, reset the branch and re-run the agent in isolation.

### Stash confusion across worktrees

Because the stash is shared, popping a stash in the wrong worktree applies changes to the wrong branch context.

**Recovery:** Prefer WIP commits or worktree isolation over cross-worktree stash operations. If stashed, note the stash ref and target worktree explicitly.

### Detached HEAD worktrees

Creating a worktree at a specific commit (not a branch) puts you in detached HEAD state. Commits made there can become unreachable.

**Recovery:** Create a branch immediately: `git switch -c my-temp-branch`.

### IDE and file-watcher conflicts

Two worktrees mean two copies of `node_modules`, `target/`, or `.venv/` if you build in each. This is expected but surprises developers who expect shared build artifacts.

**Recovery:** Treat each worktree as a fully independent environment for build outputs. Use separate dependency installs or symlink strategies if disk is a concern.

---

## 9. Scaling Considerations

### Repository size

Worktrees share the object store, so adding a worktree is fast even for large repos. The cost scales with the **working tree** size — each checkout duplicates tracked files on disk. For repos with large LFS assets or generated artifacts, consider `.gitignore` discipline and sparse checkout.

### Team size

More developers do not change the worktree model directly — each developer manages their own worktrees locally. The scaling concern is **coordination**: with many active branches, knowing which worktrees are yours and which are stale matters.

### Number of AI agents

Each agent needs its own worktree. Three concurrent agents means three additional directories. Beyond three or four parallel agents in an active codebase, review volume and merge conflicts typically become the bottleneck — not worktree creation speed.

### Code review volume

Worktrees lower the friction of local PR review, which can increase review throughput. Ensure review culture scales with the easier checkout — local review is not a substitute for CI.

### Monorepos

Worktrees work in monorepos but multiply disk usage for working trees. Consider whether agents need the full monorepo checkout or a sparse subset.

### CI/CD

CI systems typically clone fresh rather than use worktrees. Worktrees shine in **local and agent workflows**, not in replacing CI isolation. Some teams use worktrees for local CI dry-runs before push.

### Governance

Shared hooks and config mean a hook change affects all worktrees instantly. For teams with strict compliance hooks, this is a feature. For teams needing per-task hook overrides, it is a limitation.

---

## 10. Team Size Implications

### Solo developers

Worktrees are high-value for solo work. The hotfix-while-feature-in-progress scenario is common even on a team of one. Start with two worktrees: main task plus one for interrupts (review, hotfix, experiments).

### Small startups

Parallel feature development and agent-assisted coding benefit immediately. Naming conventions for worktree directories (`../repo-feature-name`) prevent confusion. Clean up merged worktrees weekly.

### Growing teams

Introduce team norms: one worktree per active task, no shared agent directories, document the pattern in onboarding. Review throughput improves when local PR checkout is standard practice.

### Enterprise organizations

Consider interaction with security tooling (secret scanners, credential helpers), mandated hook frameworks, and disk quotas. Worktrees share config — if per-project credentials are required, clones may be simpler for some tasks. See [Git Worktrees vs Clones](./git-worktrees-vs-clones).

### Open source maintainers

Worktrees help maintainers review contributor PRs locally while keeping their own work-in-progress untouched. For drive-by contributions, the overhead of worktree management may exceed simply stashing — judge by review frequency.

---

## 11. Cost / Benefit Analysis

### What you invest

| Investment | Typical effort |
|---|---|
| Learning `git worktree` commands | 15–30 minutes |
| Directory naming conventions | One-time team decision |
| Per-worktree dependency setup | Varies by stack (Node, Rust, etc.) |
| Cleanup discipline | Minutes per week |
| Tooling setup (IDE, agents) | One-time per editor/agent |

### What you gain

| Return | Impact |
|---|---|
| Eliminated stash cycles | Saves 5–15 minutes per interrupt, plus reduced error risk |
| Parallel agent execution | Multiple tasks progress simultaneously |
| Faster local PR review | Reviewers merge sooner, less context loss |
| Reduced clone overhead | Faster spin-up vs full clones for each task |
| Preserved flow state | Feature work stays open in your editor while interrupts happen elsewhere |

**Break-even point:** If you switch branches more than twice a day or run concurrent agent tasks, worktrees typically repay their setup cost within the first week.

---

## 12. When NOT to Use It

Worktrees are not the right tool in every situation:

- **You only ever work on one branch at a time** — a single checkout is simpler. Do not add complexity you will not use.
- **You need fully independent Git environments** — different remotes, credentials, or hooks per task. Use a [clone](./git-worktrees-vs-clones) instead.
- **The task is a quick one-file look** — `git show branch:path/to/file` or a GitHub web view may suffice without a whole worktree.
- **Disposable throwaway experiments** — `rm -rf` on a clone is psychologically and operationally cleaner than unlinking a worktree from your main repo.
- **Tooling does not support multiple checkouts** — some legacy build systems hardcode a single repo path.
- **Disk is extremely constrained** — each worktree duplicates the working tree. Clones have the same issue; sparse checkout or a single checkout may be the only option.

---

## 13. Alternatives

### Git stash

| Strengths | Weaknesses | Ideal for |
|---|---|---|
| Zero setup | Destroys flow state; easy to forget or mis-apply | 30-second branch switches with no uncommitted work |
| Built into every Git install | Does not support parallel execution (tests, agents) | Single quick interrupts |

### Multiple clones

| Strengths | Weaknesses | Ideal for |
|---|---|---|
| Full isolation (config, remotes, hooks) | Duplicates object store; requires push/fetch to share commits | Different remotes, teaching demos, disposable environments |
| `rm -rf` is clean and total | Slower setup for large repos | Tasks that must not touch main repo state |

See [Git Worktrees vs Clones](./git-worktrees-vs-clones) for a detailed comparison.

### Branch switching in one checkout

| Strengths | Weaknesses | Ideal for |
|---|---|---|
| Simplest possible model | Blocks parallel work; requires stash or commit | Linear, single-task workflows |

### Cloud-based ephemeral environments

| Strengths | Weaknesses | Ideal for |
|---|---|---|
| No local disk usage | Network latency; cost; less control | CI preview environments, remote development |

### Workspace managers (Treq, Jujutsu, etc.)

| Strengths | Weaknesses | Ideal for |
|---|---|---|
| Worktree management, branch naming, merge UI | Requires tool adoption | Teams running multiple agents or workspaces daily |

---

## 14. Related Concepts

- [Git Worktrees vs Clones](./git-worktrees-vs-clones) — when to share a repo vs fork a full copy
- [What are Stacked PRs?](./stacked-prs) — chaining PRs that each need their own checkout
- [Parallel Development Workflow](/learn/workflows/git/parallel-development) — running multiple workstreams without interference
- [AI Feature Development Workflow](/learn/workflows/ai/ai-feature-development) — scoping and reviewing agent work in isolated workspaces
- [Human-in-the-Loop Review Workflow](/learn/workflows/git/human-in-the-loop-review) — reviewing agent output before merge
- [What are Coding Agents?](/learn/concepts/ai-engineering/coding-agents) — why agents need isolated working directories
- [Agent Orchestration](/learn/concepts/ai-engineering/agent-orchestration) — coordinating multiple agents across workspaces
- [Managing Workspaces](/learn/tutorials/managing-workspaces) — creating and managing workspaces in Treq

---

## 15. Next Step

If you regularly interrupt feature work for reviews or hotfixes, create one additional worktree today:

```bash
git worktree add ../$(basename "$PWD")-review origin/main
```

Use it the next time a PR or production issue needs your attention. If the pattern sticks, read [Parallel Development Workflow](/learn/workflows/git/parallel-development) to structure multi-agent and multi-task workflows — or explore [Managing Workspaces](/learn/tutorials/managing-workspaces) to manage worktrees from a single dashboard.
