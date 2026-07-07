---
sidebar_position: 2
---

# What are Stacked PRs?

Stacked PRs (also called stacked diffs or stacked branches) are a workflow where a series of pull requests are chained together, each building on the previous one, so that large features can be broken into smaller, independently reviewable pieces without waiting for the entire chain to merge.

## The problem stacked PRs solve

Large pull requests are slow to review and hard to reason about. A PR with 2,000 changed lines forces reviewers to hold a lot of context simultaneously, and a single concern can block the entire change from merging.

The alternative — waiting to open a PR until the full feature is done — creates long-lived branches that diverge from main, accumulate merge conflicts, and delay feedback.

Stacked PRs let you open PR #1 (the foundation), PR #2 (builds on #1), and PR #3 (builds on #2) all at once. Reviewers can focus on each piece independently. As each PR merges, the next one's diff shrinks to only what it adds.

## How stacking works

Each branch targets the previous branch rather than `main`:

```
main
└── feature/auth-foundation    ← PR #1, targets main
    └── feature/auth-ui        ← PR #2, targets feature/auth-foundation
        └── feature/auth-tests ← PR #3, targets feature/auth-ui
```

When PR #1 merges into `main`, PR #2's diff on GitHub changes: the base is now `main` (where #1 landed), so the diff shows only what #2 adds on top.

## Rebasing the stack

The complexity in stacked PRs is keeping the stack up to date. When you amend a commit in PR #1 — to address review feedback — every branch above it needs to rebase. With a three-deep stack, that's two rebase operations. With deeper stacks or frequent changes, this becomes mechanical work that tooling can automate.

## When stacked PRs help most

- Building a feature that requires schema changes, business logic, and UI changes in sequence
- Refactoring a module while adding new behaviour on top
- Implementing a library, then the integration of that library, as separate reviewable units
- Working with reviewers who prefer focused, bite-sized diffs

## When to keep things flat

Stacking adds coordination overhead. For small, self-contained changes, a single PR is simpler. Stacking pays off when the feature genuinely has separable layers, each meaningful on its own.

## Related concepts

- [What are Git Worktrees?](./git-worktrees)
- [Merge vs Rebase](./merge-vs-rebase)
- [Cherry-pick vs Rebase](./cherry-pick-vs-rebase)
