---
sidebar_position: 5
---

# Merge vs Rebase

## Introduction

`git merge` and `git rebase` both integrate changes from one branch into another, but they produce fundamentally different history shapes and carry different implications for collaboration, auditability, and safety. Merge records the integration as an explicit event in the history, preserving the divergence that existed between branches. Rebase rewrites the current branch's commits to appear as if they were started from the tip of the target branch — producing a linear sequence without any visible record of divergence.

The problem developers face is that both commands accomplish the surface goal — getting the commits from one branch into another — but the choice between them affects how easy the history is to read, how safe it is to collaborate on shared branches, how tools like `git bisect` and `git blame` behave, and what your repository's history communicates to future engineers. Choosing based on habit rather than understanding leads to either tangled merge-commit graphs that are hard to navigate, or unsafe rewrites of shared history that disrupt colleagues and create difficult recovery situations.

This article is for developers who want to choose deliberately between merge and rebase rather than defaulting to one without understanding the other. It is also for engineering teams establishing a consistent Git workflow across multiple contributors. After reading, you will understand what each command produces at the commit level, how to visualize the history shapes they create, the safety rules that determine when rebase is appropriate, the strongest arguments for each approach, how the "rebase then merge" pattern combines the benefits of both, and how this choice affects `git bisect`, `git blame`, and day-to-day team workflows.

## Understanding the Concept

`git merge <branch>` creates a new "merge commit" that has two parents: the tip of the current branch and the tip of the branch being merged in. Both lines of history converge at this merge commit. The history records that these two lines existed separately and then joined at a specific point. No existing commits are modified.

`git rebase <upstream>` rewrites the current branch's commits so they appear to have started from the tip of `<upstream>`. Git takes each commit on the current branch that is not on `<upstream>`, computes the diff that commit introduced, and re-applies those diffs one at a time on top of `<upstream>`, creating new commits with new SHAs. The branch is "re-based" — its starting point moves — and the old commits are abandoned in favor of the new ones.

A diagram makes the difference concrete. Before either operation:

```
main:      A - B - C
                    \
feature:             D - E
```

After `git merge main` from the feature branch:

```
main:      A - B - C ---------
                    \          \
feature:             D - E - M    (M is the merge commit; its parents are E and C)
```

After `git rebase main` from the feature branch:

```
main:      A - B - C
                    \
feature:             D' - E'   (D' and E' are new commits with new SHAs)
```

The key characteristics diverge in several important ways. Merge is non-destructive — no existing commits are ever changed. Rebase rewrites commits, replacing them with new ones that carry different SHAs even though they introduce identical code changes. Conflict resolution with merge happens once at merge time, covering the full combined change. With rebase, conflicts can occur once per commit being replayed — a branch with ten commits may require resolving conflicts in multiple individual commits before the rebase completes.

| | Merge | Rebase |
|---|---|---|
| History shape | Preserves divergence; creates merge commits | Linear; divergence is invisible |
| Original commits | Unchanged | Replaced with new SHAs |
| Conflict resolution | Once, at merge time | Once per replayed commit |
| Traceability | Exact record of when branches integrated | Integration point not visible |
| Safe on shared branches | Yes | Only if you are the sole author |
| `git bisect` on main | Works; merge commits add navigational noise | Clean linear bisection |
| `git blame` behavior | May trace into merged side branches | Follows linear history directly |

## Applying It in Practice

The standard merge workflow integrates a feature branch into main by creating a merge commit:

```bash
git checkout main
git merge feature/my-work
# Git creates a merge commit: "Merge branch 'feature/my-work'"
```

The merge commit record is searchable: `git log --merges` lists only integration points, giving you an audit trail of when features landed. `git log --graph` shows the full branching and convergence structure visually.

The standard rebase workflow updates a feature branch to the current state of main before integrating:

```bash
git checkout feature/my-work
git fetch origin
git rebase origin/main
# Your commits D and E are replayed as D' and E' on top of origin/main
git push --force-with-lease    # Required after rebase since SHAs have changed
```

The `--force-with-lease` flag is meaningfully safer than `--force`: it refuses to overwrite the remote branch if someone else has pushed since your last fetch, preventing accidental overwrites of others' work.

The "rebase then merge" pattern combines the strengths of both approaches and is common in teams that want clean feature history alongside explicit integration records:

```bash
# 1. Bring the feature branch current by rebasing onto main
git checkout feature/my-work
git rebase origin/main

# 2. Merge into main, forcing a merge commit even if fast-forward is possible
git checkout main
git merge feature/my-work --no-ff
```

The `--no-ff` flag prevents a fast-forward merge (where Git would simply move `main` forward without a merge commit) and ensures the integration is recorded as a discrete event. The `git log --graph` output for `main` shows a clean history: a sequence of merge commits, each representing a feature landing, with the feature branch's commits cleanly attached.

A related pattern is squash-merge, which takes all commits from the feature branch and collapses them into a single new commit on `main`:

```bash
git checkout main
git merge --squash feature/my-work
git commit -m "feat: implement user authentication"
```

Squash-merge produces the cleanest possible `main` history — one commit per feature — at the cost of losing the individual commit granularity from the feature branch.

## Engineering Considerations

The argument for merge centers on traceability and safety. Merge never rewrites existing commits, so it is always safe on shared branches regardless of how many people are working on them. The merge commit is an explicit record of when and how branches were integrated — valuable for audit trails, for `git log --merges`, and for understanding the evolution of a long-lived project. The non-destructive nature of merge makes it the conservative choice: if in doubt, merge.

The argument for rebase centers on readability and tool effectiveness. A linear history is substantially easier to read in `git log`. `git bisect` — Git's binary search tool for locating which commit introduced a bug — is more reliable on linear history because it does not need to navigate merge bubbles; each step in the bisect is unambiguous. `git blame` traces changes more directly on linear history, following a clean chain rather than potentially jumping into merged side branches. Teams that care deeply about the long-term navigability of their history tend to favor rebase-based workflows.

The golden rule of rebase: never rebase a branch that others have checked out or based work on. Rebase changes commit SHAs. Anyone who has the old SHAs in their local history now has a divergence from the rewritten remote branch after a force-push. The only safe targets for rebase are private branches — branches you have not yet pushed, or branches where you are the sole author and are certain no colleague has based local commits on them. On shared branches — `main`, `develop`, any branch referenced in a PR where others are commenting — do not rebase. Merge instead.

The practical recommendation for most teams: use rebase locally to keep feature branches current with `main`, resolving conflicts commit-by-commit with fine-grained control. Use merge (or squash-merge, depending on your preference for commit granularity) to integrate features into `main`, recording the integration as an explicit event. This combination gives you the conflict-resolution clarity of rebase on private branches and the integration traceability of merge on the shared branch. Never rebase `main` itself; never rebase a branch that has been shared with and reviewed by others without prior coordination.

## Scaling & Operational Considerations

The most common team failure mode with rebase is the force-push accident: an engineer rebases a shared branch and force-pushes it to the remote without warning the team. Colleagues who have based local work on the old SHAs now face a confusing divergence from the remote. Recovery requires each affected engineer to run `git rebase origin/<branch>` or `git pull --rebase` to align with the rewritten history, and if they have uncommitted work on top of the old commits, the recovery is even more complex. The team policy fix is explicit and enforced: force-push to any shared branch requires prior communication, and `--force-with-lease` is always preferred over `--force` as a basic safety measure.

A persistent misconception is that merge commits are inherently noise to be eliminated. In practice, merge commits on `main` are valuable records of when features landed and can be navigated efficiently with `git log --merges`. The noise is merge commits within long-lived feature branches — those accumulate from keeping the branch up to date and clutter the branch's own commit log. The distinction matters: rebase feature branches before merging into `main` to clean up their internal history, but record the integration into `main` as a merge commit for traceability.

At scale, the choice of merge strategy has a measurable impact on `git bisect` performance. On a codebase with hundreds of merge commits in `main`, bisect has to navigate a complex graph, and the merge commits represent additional points to test that do not correspond to meaningful code changes. On a repository where `main` is kept linear via squash-merge or rebase-merge, bisect runs through a clean sequence of commits each representing a discrete change. For large, long-lived codebases where bisecting regressions is a regular activity, the linear history strategy pays compounding dividends over years.

Team size changes the calculus. Small teams where every engineer knows every branch can use rebase more aggressively — everyone knows which branches are private and which are shared. Large teams with many contributors and many concurrent branches need more conservative defaults, because the probability that a "private" branch has a secret dependant is higher. The operational recommendation for growing teams is to establish the rule explicitly rather than relying on implicit understanding: a clear definition of "shared branch" (anything pushed to the remote and referenced in a PR) and a firm prohibition on rebasing those branches removes most of the ambiguity.

## Next Steps

- [Cherry-pick vs Rebase](./cherry-pick-vs-rebase) — how cherry-pick differs from rebase in scope and purpose, and when each is the right tool for moving commits between branches
- [What are Stacked PRs?](./stacked-prs) — how stacked PRs use rebase as the mechanism for keeping a chain of branches aligned, and the cascade complexity this introduces in practice
- [Stacked PR Workflow](/learn/workflows/git/stacked-pr) — step-by-step guide to the rebase-cascade workflow in practice, including tooling that automates stack maintenance
- [Parallel Development Workflow](/learn/workflows/git/parallel-development) — how merge and rebase strategy fits into a parallel-branch development setup with multiple concurrent workstreams
