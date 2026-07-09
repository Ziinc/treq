---
sidebar_position: 0
---

# What is Version Control?

## Introduction

Version control is the practice of tracking every change made to a codebase over time, recording who made each change, when they made it, and why. It is the foundational infrastructure of collaborative software development: without it, two engineers cannot safely modify the same file, there is no reliable way to understand how the code reached its current state, and recovering from a mistake means hoping you saved a backup. Every professional software team uses version control.

The problem version control solves is coordination under uncertainty. Code is edited concurrently by multiple people, across multiple machines, over months or years. Without a system to track and reconcile those changes, the codebase is a single shared document that anyone can accidentally overwrite. Version control replaces that fragile model with a structured history: a sequence of named, attributable snapshots that can be inspected, compared, shared, and undone.

This article is for developers who are new to version control, engineers evaluating whether to adopt a new version control system, and teams asking whether Git is still the right tool for their workflow in an era where alternatives like Jujutsu are gaining traction. After reading, you will understand how distributed version control works conceptually, how Git's model functions in practice, how Jujutsu differs from Git while remaining compatible with it, and how to decide which system fits your team's needs.

## Understanding the Concept

Version control systems record a history of changes to a set of files. The fundamental unit of that history is the **commit**: a snapshot of the repository at a specific point in time, paired with metadata — author, timestamp, and a message describing the change. Commits form a directed graph: each commit knows which commit (or commits) preceded it, creating a chain of ancestry that can be traversed from any point back to the beginning of the project.

The mental model that helps most: a version control repository is a time machine for your codebase. At any moment, you can ask "what did this file look like six months ago?", "who changed this line and why?", or "which change introduced this bug?" The history is the answer to all of these questions, and version control makes the history queryable, traversable, and shareable.

**Key terminology:** A **repository** (repo) is the collection of files plus the full history of their changes. A **working tree** is the directory on disk where you actually edit files — what you see in your editor. A **branch** is a named pointer to a commit, representing a line of development that can diverge from and later rejoin the main history. A **merge** is the operation of combining diverged histories. A **remote** is a copy of the repository hosted elsewhere — on a server or another machine — used for collaboration and backup.

Distributed version control — the model used by Git and Jujutsu — means every developer has a complete copy of the repository on their own machine, including the full history. There is no single authoritative server that must be online to record commits or inspect history. A central server (GitHub, GitLab, Bitbucket) serves as the coordination point for collaboration, but it is a convention, not an architectural requirement. This is in contrast to earlier centralized systems like SVN, where the server held the only authoritative copy of history and offline work was severely limited.

**Git** was created by Linus Torvalds in 2005 to manage the Linux kernel source code after the previous tool's license changed. Git's design reflects the kernel's constraints: massive repository size, thousands of contributors, a need for speed, and a distribution model where no single authority controls the tree. Git stores data as a content-addressable object store: every file, every directory tree, and every commit is hashed with SHA-1 (now transitioning to SHA-256), and identified by that hash. Identical content is stored exactly once regardless of how many commits reference it. This model makes branching and merging cheap, history immutable, and corruption detectable.

**Jujutsu** (the `jj` CLI) was created at Google starting around 2019 and made public in 2022. It was designed to address ergonomic limitations in Git's interaction model while remaining fully compatible with Git's object storage. Jujutsu uses a Git repository on disk as its backend — you can use `jj` and `git` in the same repository, and commits created by one tool are readable by the other. What Jujutsu changes is the user-facing model: there is no staging area, the working copy is always represented as an "open" commit that Jujutsu automatically amends as you edit files, conflicts are non-blocking, and operations like rebasing and undoing changes are first-class UX concerns built into the tool's design.

The history of version control systems traces from early tools like SCCS (1972) and RCS (1982) — which tracked changes to individual files — through CVS and SVN, which introduced the repository-as-a-whole model with a centralized server, to Git (2005), which made distributed repositories practical at scale. Jujutsu represents the current frontier: a tool that inherits Git's proven storage model while rethinking the interaction model from first principles. Mercurial (Hg) occupied a similar position relative to early Git in the late 2000s but was ultimately eclipsed by Git's adoption momentum.

## Applying It in Practice

**A basic Git workflow** for a new feature looks like this:

```bash
# Clone a repository to your machine
git clone https://github.com/org/repo.git
cd repo

# Create a branch for your work
git checkout -b feature/add-login

# Edit files, then stage and commit changes
git add src/auth/login.ts
git commit -m "Add login form component"

# Push your branch to the remote
git push -u origin feature/add-login

# When the work is done, merge into main (typically via pull request)
git checkout main
git merge feature/add-login
```

The staging area (`git add`) is Git's way of letting you compose a commit from a subset of your changes. You explicitly select which modified files go into the next commit before recording it. This gives fine-grained control over what each commit contains, but requires an extra step in every commit cycle.

**A basic Jujutsu workflow** covers the same operations with a different model:

```bash
# Clone a repository (using Git backend)
jj git clone https://github.com/org/repo.git
cd repo

# Start a new change (Jujutsu creates a new "open" commit automatically)
jj new -m "Add login form component"

# Edit files — no staging needed, changes are automatically tracked
# When ready, push to a bookmark (Jujutsu's term for a branch)
jj bookmark create feature/add-login
jj git push --bookmark feature/add-login

# Inspect current state
jj log
jj status
```

In Jujutsu there is no `git add`: every file change in the working directory is automatically part of the current open commit. To start a new unit of work, you run `jj new`, which creates a new open commit on top of the current one. To go back and amend an earlier commit, you run `jj edit <revision>` — Jujutsu moves the working copy to that commit and lets you modify it in place. This makes editing history feel like editing present state, which is a significant ergonomic improvement for workflows that involve frequent amendment.

**Comparing key daily operations:**

| Operation | Git | Jujutsu |
|---|---|---|
| Start new work | `git checkout -b branch` | `jj new` |
| Save changes | `git add . && git commit -m "..."` | `jj describe -m "..."` (auto-tracked) |
| Amend the last commit | `git commit --amend` | `jj squash` or already in-place |
| View history | `git log --oneline` | `jj log` |
| Undo last commit | `git reset HEAD~1` | `jj undo` |
| Handle a merge conflict | Resolve, then `git add && git commit` | Resolve at any time; conflicts don't block work |
| Sync from remote | `git pull` | `jj git fetch && jj rebase -d main` |

The conflict handling difference is worth highlighting. In Git, a merge conflict puts the repository in a special "conflicted" state that must be fully resolved before you can proceed with most operations. Jujutsu materializes conflicts as special markers in files and records the conflict in the commit — you can continue working, commit further changes, and resolve the conflict later. In long-running parallel workstreams, this non-blocking approach prevents conflicts from becoming workflow interruptions.

## Engineering Decision Guide

**Git's primary advantages** are ecosystem ubiquitous adoption and tooling coverage. GitHub, GitLab, Bitbucket, and every major CI/CD platform are built for Git. Every IDE has Git integration. Code review workflows, deployment pipelines, security scanning tools, and contribution processes all assume Git. Switching away from Git means opting out of a vast and mature tooling ecosystem. For the overwhelming majority of teams, Git is the right choice — not because it is the best-designed VCS, but because the ecosystem advantage compounds over time and switching costs are real.

Git also has a large, well-documented, searchable body of knowledge. When you encounter an unusual Git situation, the answer is almost certainly available in a Stack Overflow answer or blog post written years ago. That institutional knowledge does not exist yet for Jujutsu.

**Jujutsu's primary advantages** are ergonomic. The no-staging-area model removes a frequent cognitive tax. The `jj undo` command is a first-class undo history that is cleaner than Git's combination of `git reset`, `git reflog`, and `git revert`. Conflicts being non-blocking makes rebasing-heavy workflows (like stacked diffs) significantly less friction-prone. Operations that require knowing multiple Git incantations — amending an old commit in the middle of a stack, for example — are first-class commands in Jujutsu. For engineers who live in the CLI and maintain complex branch structures, the ergonomic improvement is meaningful.

The trade-off is adoption cost. Your team, your CI scripts, your code review platform, and your deployment tooling all assume Git semantics. Jujutsu is Git-compatible at the storage level, but the interaction model differences mean that Git documentation and Stack Overflow answers do not directly apply. Team members need to learn Jujutsu's model from scratch. The ecosystem is growing but still small.

**When to choose Git:** you are working on a team of any size that has not already adopted Jujutsu; you rely on GitHub Actions, GitLab CI, or any standard CI/CD platform; you use a code review tool with Git-native features; your team includes contributors who are not VCS power users and would be confused by a new tool. Git is the safe default and should be the choice whenever there is doubt.

**When to consider Jujutsu:** your team is small and technically sophisticated; you regularly deal with complex rebase workflows, stacked diffs, or frequent history amendment; you have the appetite to invest in tooling adoption upfront in exchange for ongoing ergonomic improvements; or you are starting a greenfield project and want to make a deliberate choice rather than defaulting to Git. Jujutsu is particularly compelling for teams that already feel the friction of Git's staging area and rebase workflows acutely.

**When not to choose Jujutsu:** you have engineers unfamiliar with Git whose onboarding would be complicated by a non-standard tool; you depend on Git-specific integrations that Jujutsu cannot replicate; or your organization has Git baked into its compliance, audit, or workflow processes in ways that are expensive to change.

The engineering recommendation: use Git. Evaluate Jujutsu if your team already feels the specific pain points it addresses — complex stacked workflows, frequent history amendment, conflict-heavy rebase operations — and has the runway to invest in adoption. The storage-level compatibility means you can adopt Jujutsu incrementally: individual engineers can use `jj` locally on a Git repository without requiring the whole team to switch.

## Scaling & Operational Considerations

**Monorepo scale** is a known stress point for Git. Repositories with millions of files and gigabytes of history require significant configuration tuning: partial clones (`git clone --filter=blob:none`), sparse checkouts, and Git's virtual filesystem (VFS for Git, originally built for the Windows codebase) to remain usable. Jujutsu was designed partly with monorepo scale in mind — Google's internal codebase is enormous — but its ecosystem support for monorepo tooling is less mature than the Git ecosystem's. For teams at the scale where this matters, both tools require deliberate engineering investment.

**Large binary files** are a weakness shared by both Git and Jujutsu, because both use Git's object store. Git's content-addressable model stores every version of every file independently, which causes repositories with large binary assets (videos, compiled artifacts, machine learning models) to grow unboundedly. The standard mitigation is Git LFS (Large File Storage), which stores large blobs in a separate content-addressed store and puts pointer files in Git. Jujutsu's Git backend means Git LFS applies equally.

**Team size implications** differ between the tools. Git's explicit staging area and commit cycle, while sometimes tedious for experienced engineers, provides a natural checkpoint that prevents accidental commits — you must explicitly select what goes into each commit. Jujutsu's auto-tracking model lowers this friction but also lowers the barrier to accidentally including unwanted changes. Jujutsu provides `jj diff` to review the current working-copy commit before describing it, but this requires discipline rather than being enforced by the workflow.

**History rewriting** — amending commits, rebasing branches, squashing history — is common in both tools but carries real operational risk. Rewriting history that has been pushed to a shared remote requires force-pushing, which can destroy colleagues' work if they have based commits on the history being rewritten. Git's `--force-with-lease` flag and Jujutsu's equivalent protections reduce the risk but do not eliminate it. Teams should establish clear conventions about which branches are "rewrite-safe" (personal feature branches) and which are not (main, release branches).

**The most common misconception** about version control is that the commit history is primarily for your own reference. In practice, the commit history is the primary audit trail for a codebase — it is how teams understand why decisions were made, how reviewers understand the intent of a change, and how engineers six months from now diagnose unexpected behavior. Writing clear, descriptive commit messages is one of the highest-leverage practices in software engineering, and it applies equally in Git and Jujutsu.

**Recovery from mistakes:** Git's `git reflog` provides a per-repository log of every operation that moved `HEAD`, which allows recovery from nearly any local mistake as long as the affected commits have not been garbage-collected. Jujutsu's `jj undo` and `jj op log` provide an operation log at an even higher level — every `jj` command that changed repository state is recorded and individually reversible. This makes Jujutsu more recoverable from mistakes than Git in practice, because you do not need to know the SHA of the commit you want to restore.

## Next Steps

- [What are Git Worktrees?](./git-worktrees) — how to maintain multiple working directories in a single repository, including a comparison of Git worktrees and Jujutsu workspaces
- [Git Worktrees vs Clones](./git-worktrees-vs-clones) — when to use a worktree versus a full clone for parallel development and agent orchestration
- [Merge vs Rebase](./merge-vs-rebase) — the two strategies for integrating diverged histories, their trade-offs, and when each is appropriate
- [What are Stacked PRs?](./stacked-prs) — a workflow pattern that pairs well with both Git and Jujutsu for decomposing large features into reviewable increments
- [Parallel Development Workflow](/learn/workflows/git/parallel-development) — a practical guide to running concurrent workstreams using version control primitives
