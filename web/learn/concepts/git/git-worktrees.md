---
sidebar_position: 1
---

# What are Git Worktrees?

_Additional working directories linked to one repository, so you can check out multiple branches at once without stashing or cloning._

A Git worktree is an extra working directory attached to the same repository. A normal clone gives you one folder where files are checked out and your editor runs. `git worktree add` creates a second, third, or tenth directory, each with its own branch, while all of them share the same `.git` object store and history.

Worktrees matter because switching branches rewrites every tracked file in your working directory. That costs time and attention. If you juggle features, reviews, hotfixes, and AI agent tasks, you need parallel directories without the disk and sync overhead of multiple clones.

Anyone who works on more than one branch at a time should understand worktrees. That includes solo developers, reviewers, platform engineers running CI-adjacent tasks, and teams orchestrating multiple coding agents.

## The Problem

A standard Git repository has one working tree. Checking out a different branch changes every tracked file in that directory. If you are mid-task on a feature branch and need to review a pull request, reproduce a production bug, or run a long test suite on another branch, you must first stash, commit, or discard your current work.

Developers usually search for a solution at a specific moment. A hotfix lands while feature work is half-finished. A reviewer asks for a local checkout of a PR. A test run blocks the only directory you have. The underlying question is always the same: how do I work on two branches at once without losing context?

The symptoms are familiar. Frequent `git stash` and `git stash pop` cycles that corrupt mental state. Half-committed WIP commits created just to switch branches. Abandoned local experiments because switching back felt too costly. One terminal blocked by a twenty-minute test run while other work waits. AI agents overwriting each other's changes in a shared checkout.

Coding agents make this worse. They need an isolated working directory to run autonomously. When multiple agents, or an agent and a human, share one checkout, they compete for the same files, branch, and index. An agent mid-refactor can block your hotfix. Your uncommitted edits can confuse an agent's file reads. The cost of context switching used to be mostly human. With agents, it is also computational: restarting a session, re-scoping a task, or re-running work because the working tree changed underneath it.

## Core Concept

Think of a Git repository as two layers. The **database** holds objects, refs, config, and history in `.git`. The **working tree** is the files on disk you actually edit. A normal clone has one of each. `git worktree add` creates additional working trees that all read and write the same database. A commit in any worktree is immediately visible everywhere.

```
your-repo/                    <- main worktree (branch: feature/auth)
├── .git/                     <- shared object store, refs, config
├── src/
└── ...

your-repo-hotfix/             <- linked worktree (branch: hotfix/login-bug)
├── src/                      <- own checked-out files
└── .git  ->  file pointing back to ../your-repo/.git
```

The **main worktree** is the original checkout from your clone or `git init`. A **linked worktree** is any additional checkout created with `git worktree add`. Each worktree has its own **working tree** (checked-out files), **index** (staging area), and **HEAD** (current branch). All worktrees share commits, branches, remote configuration, and the stash.

**Branches** define lines of history. Worktrees let you materialize multiple branches on disk at the same time. **Clones** also give you multiple working directories, but duplicate the object store and ref namespace. See [Git Worktrees vs Clones](./git-worktrees-vs-clones) for when each approach fits. **Workspaces** in tools like Treq or Jujutsu are higher-level abstractions that often map to worktrees under the hood. [Stacked PRs](./stacked-prs) benefit from worktrees when each PR in the stack needs its own checkout for review or amendment.

## How It Works

```bash
# Create a worktree at ../hotfix, branching from origin/main
git worktree add ../hotfix origin/main -b hotfix/critical-bug

# List all worktrees
git worktree list

# Remove a worktree when done
git worktree remove ../hotfix
```

Each worktree owns its checked-out files, `HEAD`, index, uncommitted changes, and current working directory. All worktrees share commits and objects, branches and tags, remote configuration, Git hooks, and the stash. Hooks run in the context of the worktree that triggered the operation.

```
t=0   Clone repo -> one worktree on main
t=1   git worktree add ../feature-a -b feature/a   -> two worktrees
t=2   Commit in ../feature-a                        -> commit visible in both
t=3   git worktree add ../review-pr-42 pr-42-branch -> three worktrees
t=4   Merge feature/a, git worktree remove ../feature-a -> back to two
```

Git enforces one branch per worktree. You cannot check out the same branch in two worktrees simultaneously. Git prevents diverging `HEAD` states on the same ref. The stash is shared across all worktrees. Stashing in one worktree and popping in another works, but it is rarely intentional.

## Practical Example

You maintain `acme-api`, a backend service. You are implementing `feature/rate-limiting` in your main checkout. Production reports a login regression. A colleague's PR needs your review. You also want a coding agent to draft rate-limiting tests in parallel.

```bash
# Main checkout: your feature work continues here
cd ~/code/acme-api          # branch: feature/rate-limiting

# Hotfix worktree: reproduce and fix the login bug
git worktree add ../acme-api-hotfix origin/main -b hotfix/login-regression

# PR review worktree: check out colleague's branch locally
git fetch origin pull/42/head:pr/42-oauth-refresh
git worktree add ../acme-api-pr42 pr/42-oauth-refresh

# Agent worktree: isolated sandbox for test generation
git worktree add ../acme-api-agent feature/rate-limiting -b feature/rate-limiting-tests
```

Your main checkout stays on `feature/rate-limiting` for core implementation. The hotfix worktree checks out `hotfix/login-regression` where you reproduce and fix the bug. The PR review worktree checks out `pr/42-oauth-refresh` for a local build and review. The agent worktree checks out `feature/rate-limiting-tests` where the agent drafts tests without touching your half-finished implementation.

You fix the hotfix, push, and open a PR without disturbing your rate-limiting edits. You review PR #42 with a real local build. The agent runs in its own directory. When the hotfix merges, you rebase `feature/rate-limiting` in your main checkout. The agent's test branch can be rebased or merged into your feature branch after review.

Tools like [Treq](/learn/tutorials/managing-workspaces) automate this pattern. Each workspace maps to a directory under `.treq/workspaces/` with its own branch, managed from a single dashboard.

## Benefits

Worktrees improve outcomes rather than adding features for their own sake. You can check out a PR branch locally without disturbing in-progress work, which speeds up reviews. Stash-and-forget accidents disappear because each task keeps its own directory. You can run a long test suite in one worktree while continuing development in another.

Each task keeps its own editor, terminal, and mental frame, which reduces context switching. Each agent gets an isolated directory, and completed work is reviewed before merging, which makes AI-generated changes safer. Because all worktrees share the object store, you avoid the disk and sync cost of multiple clones. A commit in one worktree is instantly available in all others.

## Trade-offs

Worktrees are not free. You now manage multiple directories instead of one. `git worktree list` becomes part of your routine. It is easy to forget which directory corresponds to which task, especially when names look similar.

All worktrees share remotes, hooks, and `.git/config`. You cannot easily use different credentials per worktree. One branch maps to one worktree. Checking out `main` in a second worktree requires a different ref, such as a detached checkout of `origin/main`. Orphaned worktree directories accumulate after branches merge. Stale worktrees consume disk for working trees that serve no purpose.

Some tools assume a single checkout per repo. IDEs, file watchers, and language servers may need per-worktree configuration. Worktrees trade simplicity for concurrency. That trade pays off when parallel work is frequent. It does not pay off when you rarely leave your current branch.

## Failure Modes

Checking out the same branch in two worktrees fails immediately:

```bash
git worktree add ../second feature/auth
# fatal: 'feature/auth' is already checked out at '/path/to/main-checkout'
```

Use a different branch name, or remove the existing worktree that holds the branch.

After merging `hotfix/login-regression`, the `acme-api-hotfix` directory may still exist on disk. It looks like active work but serves no purpose. Run `git worktree remove ../acme-api-hotfix`, or `git worktree prune` for stale entries.

Two agents writing to the same directory produce interleaved, conflicting edits. The failure looks like a bad merge, but there was never a merge. Just concurrent writes. Give each agent its own worktree. If the damage is done, reset the branch and re-run the agent in isolation.

Because the stash is shared, popping a stash in the wrong worktree applies changes to the wrong branch context. Prefer WIP commits or worktree isolation over cross-worktree stash operations. If you do stash, note the stash ref and target worktree explicitly.

Creating a worktree at a specific commit rather than a branch puts you in detached HEAD state. Commits made there can become unreachable. Create a branch immediately with `git switch -c my-temp-branch`.

Two worktrees mean two copies of `node_modules`, `target/`, or `.venv/` if you build in each. This is expected but surprises developers who expect shared build artifacts. Treat each worktree as a fully independent environment for build outputs.

## Scaling Considerations

Worktrees share the object store, so adding a worktree is fast even for large repos. The cost scales with working tree size. Each checkout duplicates tracked files on disk. For repos with large LFS assets or generated artifacts, use `.gitignore` discipline and consider sparse checkout.

Each developer manages their own worktrees locally. Team size does not change the model directly. The scaling concern is coordination. With many active branches, knowing which worktrees are yours and which are stale matters.

Each agent needs its own worktree. Three concurrent agents means three additional directories. Beyond three or four parallel agents in an active codebase, review volume and merge conflicts typically become the bottleneck, not worktree creation speed.

Worktrees lower the friction of local PR review, which can increase review throughput. Local review is not a substitute for CI. In monorepos, worktrees multiply disk usage for working trees. Consider whether agents need the full checkout or a sparse subset.

CI systems typically clone fresh rather than use worktrees. Worktrees shine in local and agent workflows, not in replacing CI isolation. Some teams use worktrees for local CI dry-runs before push. Shared hooks and config mean a hook change affects all worktrees instantly. For teams with strict compliance hooks, this is a feature. For teams needing per-task hook overrides, it is a limitation.

## Team Size Implications

Solo developers benefit immediately. The hotfix-while-feature-in-progress scenario is common even on a team of one. Start with two worktrees: your main task plus one for interrupts like reviews, hotfixes, or experiments.

Small startups gain the most from parallel feature development and agent-assisted coding. Adopt a naming convention for worktree directories, such as `../repo-feature-name`, and clean up merged worktrees weekly.

Growing teams should document the pattern in onboarding. One worktree per active task. No shared agent directories. Review throughput improves when local PR checkout is standard practice.

Enterprise organizations need to consider security tooling, credential helpers, mandated hook frameworks, and disk quotas. Worktrees share config. If per-project credentials are required, clones may be simpler for some tasks. See [Git Worktrees vs Clones](./git-worktrees-vs-clones).

Open source maintainers can review contributor PRs locally while keeping their own work-in-progress untouched. For infrequent drive-by contributions, the overhead of worktree management may exceed simply stashing. Judge by how often you review.

## Cost / Benefit Analysis

Learning `git worktree` commands takes fifteen to thirty minutes. Directory naming conventions are a one-time team decision. Per-worktree dependency setup varies by stack. Cleanup takes minutes per week. Tooling setup for your IDE and agents is a one-time cost per editor.

The returns are concrete. Eliminated stash cycles save five to fifteen minutes per interrupt and reduce error risk. Parallel agent execution lets multiple tasks progress simultaneously. Faster local PR review means reviewers merge sooner with less context loss. Shared object stores spin up faster than full clones. Feature work stays open in your editor while interrupts happen elsewhere.

If you switch branches more than twice a day or run concurrent agent tasks, worktrees typically repay their setup cost within the first week.

## When NOT to Use It

A single checkout is simpler if you only ever work on one branch at a time. Do not add complexity you will not use.

Use a [clone](./git-worktrees-vs-clones) when you need fully independent Git environments with different remotes, credentials, or hooks per task. For a quick one-file look, `git show branch:path/to/file` or a web view may suffice without a whole worktree.

`rm -rf` on a clone is psychologically and operationally cleaner than unlinking a worktree from your main repo. This matters for disposable throwaway experiments. Some legacy build systems hardcode a single repo path and do not support multiple checkouts. If disk is extremely constrained, each worktree duplicates the working tree. Sparse checkout or a single checkout may be the only option.

## Alternatives

**Git stash** requires zero setup and works for thirty-second branch switches with no uncommitted work. It destroys flow state, is easy to forget or mis-apply, and does not support parallel execution for tests or agents.

**Multiple clones** provide full isolation for config, remotes, and hooks. They duplicate the object store, require push and fetch to share commits, and are slower to set up for large repos. They suit different remotes, teaching demos, and disposable environments where `rm -rf` must not touch the main repository. See [Git Worktrees vs Clones](./git-worktrees-vs-clones) for a detailed comparison.

**Branch switching in one checkout** is the simplest model. It blocks parallel work and requires stash or commit for every switch. It suits linear, single-task workflows.

**Cloud-based ephemeral environments** use no local disk but add network latency, cost, and less control. They suit CI preview environments and remote development.

**Workspace managers** like Treq or Jujutsu handle worktree management, branch naming, and merge UI. They require tool adoption. They suit teams running multiple agents or workspaces daily.

## Related Concepts

- [Git Worktrees vs Clones](./git-worktrees-vs-clones)
- [What are Stacked PRs?](./stacked-prs)
- [Parallel Development Workflow](/learn/workflows/git/parallel-development)
- [AI Feature Development Workflow](/learn/workflows/ai/ai-feature-development)
- [Human-in-the-Loop Review Workflow](/learn/workflows/git/human-in-the-loop-review)
- [What are Coding Agents?](/learn/concepts/ai-engineering/coding-agents)
- [Agent Orchestration](/learn/concepts/ai-engineering/agent-orchestration)
- [Managing Workspaces](/learn/tutorials/managing-workspaces)

## Next Step

If you regularly interrupt feature work for reviews or hotfixes, create one additional worktree today:

```bash
git worktree add ../$(basename "$PWD")-review origin/main
```

Use it the next time a PR or production issue needs your attention. If the pattern sticks, read [Parallel Development Workflow](/learn/workflows/git/parallel-development) to structure multi-agent and multi-task workflows. Or explore [Managing Workspaces](/learn/tutorials/managing-workspaces) to manage worktrees from a single dashboard.
