---
sidebar_position: 2
---

# What are Stacked PRs?

## Introduction

Stacked pull requests — also called stacked diffs or stacked branches — are a development workflow where a series of pull requests are chained together, each targeting the branch above it in the stack rather than targeting `main` directly. The result is a sequence of small, independently reviewable pieces that together form a larger feature, with each PR showing only the incremental change it introduces on top of its predecessor.

The problem stacked PRs solve is the review bottleneck created by large pull requests. A PR with 1,500 changed lines across ten files is slow to review, hard to reason about, and easy to block on a single design concern. Reviewers must hold enormous context simultaneously, and a single unresolved thread can stall an entire feature from landing. The typical alternative — waiting until a full feature is complete before opening any PR — makes things worse: long-lived branches accumulate merge conflicts, drift from `main`, and delay the feedback that could have shaped the design weeks earlier.

This article is for developers working on features with multiple separable layers, engineers collaborating with reviewers who prefer focused diffs, and teams evaluating whether stacked PRs are worth the coordination overhead they introduce. After reading, you will understand how branch chaining works mechanically, what the rebase cascade problem is and how tools address it, when stacking genuinely helps versus when it adds unnecessary complexity, and how to manage a stack through the full review cycle.

## Understanding the Concept

In a standard Git workflow, every feature branch targets `main`. In a stacked workflow, branches target each other: branch B is created from branch A, branch C is created from branch B, and only branch A targets `main`. Each PR's diff on GitHub shows only the changes that branch introduces relative to its parent — not the full cumulative change from `main`. When PR #1 merges into `main`, PR #2's diff on the code review platform automatically updates because its effective base is now the same point where #1 landed.

The mental model is a literal stack: each layer sits on top of the one below it and adds something meaningful on its own. Reviewers who look at PR #2 after PR #1 has merged see only what #2 adds, not the combined change across both PRs.

```
main
└── feature/auth-foundation    ← PR #1, targets main
    └── feature/auth-ui        ← PR #2, targets feature/auth-foundation
        └── feature/auth-tests ← PR #3, targets feature/auth-ui
```

The key terminology: each individual PR is a "layer" of the stack. The "stack root" is the first branch in the chain (the one targeting `main`). A "rebase cascade" is what happens when a lower layer changes in response to review feedback: every branch above it must rebase to incorporate that change, propagating upward through the stack. Without tooling, this is manual: rebase B onto A's updated state, then rebase C onto B's updated state. With a three-layer stack and active feedback on lower layers, this cascade can become the dominant time cost.

Tools like Graphite and `ghstack` automate the rebase cascade. Graphite tracks the stack structure and provides a single command that rebases the entire stack in order after any layer changes. `ghstack` takes a different approach, creating a series of GitHub PRs from a single local branch using a naming convention and custom push logic. Both tools reduce the mechanical rebase work significantly, but they introduce a tool dependency the whole team must adopt and understand.

## Applying It in Practice

Without tooling, creating a three-layer stack looks like this:

```bash
# Start from an up-to-date main
git checkout main && git pull

# Layer 1: the foundation
git checkout -b feature/auth-foundation
# ... do work ...
git commit -m "Add auth token model and database schema"

# Layer 2: built on layer 1
git checkout -b feature/auth-ui
# ... do work ...
git commit -m "Add login and registration UI components"

# Layer 3: built on layer 2
git checkout -b feature/auth-tests
# ... do work ...
git commit -m "Add integration tests for the auth flow"
```

Open three PRs: `feature/auth-foundation → main`, `feature/auth-ui → feature/auth-foundation`, `feature/auth-tests → feature/auth-ui`. When a reviewer requests a change on `feature/auth-foundation` and you amend a commit there, you must rebase each layer above it in order:

```bash
git checkout feature/auth-ui && git rebase feature/auth-foundation
git checkout feature/auth-tests && git rebase feature/auth-ui
# Then force-push each updated branch
git push --force-with-lease origin feature/auth-ui feature/auth-tests
```

With Graphite installed and the stack configured, `gt restack` handles this cascade automatically, replaying each layer in order after any change to a lower one.

A realistic scenario where stacking genuinely helps: implementing a feature that requires a new database table, a service layer, and a REST endpoint. These are naturally separable. The schema PR can be reviewed — and in some workflows, deployed — before the business logic is written. The business logic PR can be reviewed on its own merits before the API layer exists. Each layer has clear boundaries, its own test surface, and its own reviewable story. Best practice: keep each layer small enough that it could theoretically land independently without breaking the main branch. If a layer cannot exist without the layer above it already being merged, the boundary may not be the right one.

## Engineering Decision Guide

The concrete benefit of stacked PRs is faster, higher-quality review. Reviewers who process a 200-line PR focused on schema changes will give more thorough feedback than reviewers confronting a 1,000-line PR that mixes schema, business logic, and UI. Smaller PRs also merge faster, reducing the window in which conflicts accumulate with other concurrent work.

The coordination overhead is real. Every time a lower layer changes, the cascade rebase must run across every layer above it. Without tooling this is manual and error-prone. With tooling (Graphite or equivalent) it requires every team member to install and learn that tool. The GitHub UI shows stacked PRs in a way that can confuse reviewers unfamiliar with the pattern — a PR targeting a feature branch rather than `main` looks unusual and may generate questions about whether the base was set correctly.

Stacked PRs are the right choice when a feature has genuinely separable layers that each deliver reviewable value, when your team's review culture favors focused diffs, or when you cannot afford to wait for a full feature implementation before getting early feedback on foundational decisions. They are the wrong choice for small, self-contained changes where a single PR is simpler and the coordination overhead of a stack outweighs any review benefit. They are also problematic on teams where reviewers are unfamiliar with the pattern, or where the code review platform makes retargeting PRs after base-branch merges a manual, error-prone step.

Stacking adds overhead that scales with stack depth and the frequency of lower-layer changes. A two-layer stack with stable lower layer is nearly zero overhead. A five-layer stack with active feedback on layer two is significant ongoing work. The right size for most teams is two to three layers — enough to decompose a large feature without creating an unmanageable cascade.

The engineering recommendation: adopt stacking for features that have genuinely separable layers, each meaningful on its own. Do not stack for the sake of stacking. When you do stack, use tooling to automate the cascade rebase and ensure the whole team understands how to read stacked PRs on your code review platform.

## Scaling & Operational Considerations

The rebase cascade is the most common operational failure in stacked workflows. A deep stack with active review feedback on multiple layers simultaneously creates a cascading rebase requirement that can consume significant time. A mistake during the cascade — rebasing onto the wrong base, forgetting to push a layer after rebasing — corrupts the stack's diff relationships and confuses reviewers who are looking at changed PR diffs.

A very common mistake is allowing stack layers to grow too large. The discipline of stacking only pays off if each layer remains small enough to review comfortably. Teams new to stacking often create a two-layer stack where both layers are 500-plus lines. This produces two large PRs rather than one, without any benefit of independent reviewability. Discipline on layer size is what makes the workflow valuable.

Another operational issue is stale PR targeting. When the bottom of a stack merges into `main` and the next layer becomes the new effective base, the GitHub PR must be retargeted to `main`. Without tooling, this is a manual step in the GitHub UI, and it is easy to forget — leaving a PR whose diff still shows the full cumulative change rather than the incremental one. Graphite handles this retargeting automatically.

On larger teams, stack ownership becomes a coordination challenge. Multiple engineers working on the same stack simultaneously must communicate clearly about which layers are in flight, which are under review, and who is responsible for running the cascade rebase when a lower layer changes. Teams that scale stacked PRs well tend to assign one engineer as the "stack owner" — the person responsible for maintaining the cascade state and communicating changes to other contributors on the stack.

Recovery when a cascade rebase produces conflicts: resolve conflicts one layer at a time, starting from the bottom of the stack. Never try to force-push an entire stack without verifying each layer's commit history is correct after the rebase. `git log --oneline origin/main..HEAD` on each branch before pushing confirms the expected commit sequence and catches mistakes early.

## Next Steps

- [Merge vs Rebase](./merge-vs-rebase) — the rebase mechanics that underpin stack management, including the safety rules that determine when rebase is appropriate
- [Cherry-pick vs Rebase](./cherry-pick-vs-rebase) — the alternative to cascade rebasing for propagating specific changes across branches in a stack
- [Stacked PR Workflow](/learn/workflows/git/stacked-pr) — a concrete step-by-step guide to setting up and managing a stacked PR workflow, including tooling setup with Graphite
- [Parallel Development Workflow](/learn/workflows/git/parallel-development) — how to combine worktrees and stacked PRs for maximum parallel throughput on large features
