---
sidebar_position: 2
---

# Stacked PR Workflow

## Introduction

When a feature is too large to review in a single pull request, most teams do one of two things: they ship the feature as one enormous diff that no one reviews carefully, or they block all progress until the entire feature is complete. The stacked PR workflow is a third option. It breaks a large feature into a chain of pull requests — each one building on the previous — so that reviewers get focused, comprehensible diffs, and work continues forward without waiting for the full feature to land.

This workflow is for engineers (and AI agents working under engineering oversight) who are implementing features that have natural layers: a data model change, then the business logic that uses it, then the API that exposes it, then the UI on top. It matters because review quality degrades sharply as diff size grows. A 50-line diff gets careful attention; a 1,200-line diff gets a skim. Stacking keeps each individual PR at a size where a reviewer can actually understand what is changing and why.

After reading this article, you will know how to identify where to split a feature, how to structure and open a stack of pull requests, how to handle the rebase cascade when lower PRs receive review feedback, and how to merge the stack cleanly without losing work or producing broken intermediate states.

## Understanding the Concept

A stacked PR is a pull request whose base branch is not `main` but another feature branch. When you have three layers of a feature, PR #2 targets the branch for PR #1, and PR #3 targets the branch for PR #2. Each PR's diff shows only the incremental work for that layer, not the accumulated work for the entire feature.

The key insight is that this is a dependency graph, not just an ordering. PR #2 depends on PR #1 being merged first — not because of an arbitrary rule, but because PR #2's code actually imports or uses what PR #1 introduced. The stack reflects a real architectural dependency, and understanding that dependency is what tells you where to split. If you cannot describe the dependency clearly, the layers may not be as distinct as they appear.

A "stack" is the ordered sequence of branches and PRs; a "base" is the branch a PR targets; a "rebase cascade" is the chain of rebases that follows when a lower branch changes. Adjacent workflows include parallel development — multiple independent workstreams rather than one dependent chain — and feature flags, which can achieve similar goals by shipping code behind a gate rather than gating on PR review. Stacked PRs exist as a distinct pattern because they solve a specific problem: making large but architecturally layered features reviewable without requiring either a massive single diff or feature-flag infrastructure.

## Applying It in Practice

The workflow begins before you write a single line of code. Consider a feature that adds token-based authentication to an API. The natural layers are: the database schema and model for tokens, the service logic that creates and validates tokens, the middleware that enforces token authentication on routes, and the UI component that lets users generate tokens. These map to four PRs in the stack.

Create one git branch per layer, each targeting the previous. In a worktree-based setup, `workspace-1` checks out `feature/auth-tokens` targeting `main`; `workspace-2` checks out `feature/auth-middleware` targeting `feature/auth-tokens`; and so on. Implement only the work for that layer in each workspace. This isolation prevents changes from bleeding across PR boundaries — a commit touching middleware logic does not belong in the tokens PR, even if you notice a bug there while working in that workspace.

Once the first layer is working and ready for review, open its PR targeting `main`. Open subsequent PRs immediately after, each targeting the branch below it. This lets a reviewer start on PR #1 while you continue implementing PR #2. You do not need to wait for PR #1 to be approved before opening or even completing PR #2.

When a reviewer comments on PR #1, address the feedback in `workspace-1`, commit the fix, and then rebase each dependent workspace onto its updated base in sequence: `workspace-2` rebases onto the updated `feature/auth-tokens`, then `workspace-3` rebases onto the updated `feature/auth-middleware`. This rebase cascade is the main operational cost of stacked PRs. A single comment on PR #1 ripples up through the entire stack.

Merge from the bottom up. Merge PR #1 into `main`. GitHub will automatically update PR #2's base to `main`, and its diff will now show only what PR #2 adds on top. Review PR #2, address any feedback, merge. Repeat for each subsequent PR. Never merge out of order — a PR whose base has not merged yet will include a mixed diff that confuses reviewers and may introduce broken intermediate states.

Once all PRs are merged, delete the workspaces and their branches. For smaller teams or solo work, two-layer stacks are common and manageable. Three layers is usually the practical limit for active teams before the rebase cascade becomes difficult to coordinate. Keep each PR below 400 lines of changed code where possible — above that threshold, review quality typically degrades regardless of how focused the diff is.

## Engineering Decision Guide

The core benefit of stacked PRs is reviewability. Reviewers can meaningfully evaluate a 200-line diff. A 1,200-line diff representing the same feature in a single PR will receive a shallower review. Stacking also unblocks reviewers early — they can approve and merge the foundation layer before the upper layers exist, keeping work moving. For AI-assisted development, this means an agent can be implementing PR #3 while a human reviews PR #1, and the overall cycle time to ship the feature is shorter than working sequentially.

The primary trade-off is operational overhead. Every change to a lower PR requires a rebase cascade through all dependent workspaces. A four-layer stack where PR #1 receives significant feedback three times during review will require twelve rebase operations on the dependent branches. That cost is real, and it compounds with stack depth.

Stacked PRs are the right choice when the feature has genuine architectural layers, when the layers can be reviewed and merged independently, and when the team is comfortable with rebasing. They are not appropriate when the layers are tightly coupled — if every change to PR #1 requires corresponding changes in PR #2, the overhead of maintaining the stack likely outweighs the review benefit. They are also not appropriate for features that fit cleanly in a single diff. Do not stack just because you can.

The alternative for large features is a single large PR, which is simpler to manage but risks shallow review. Another alternative is incremental delivery behind a feature flag, which lets you merge code in small pieces without the stack needing to remain in a consistent intermediate state. If your team already has feature flag infrastructure, that is often preferable for very large features. For a feature in the 400–1,500 line range with two to three natural architectural layers, stacking is the most practical option.

The clear recommendation: use stacked PRs for features with genuine layered dependencies and a total diff size that would make a single PR hard to review. Limit stacks to three layers. For smaller features, use a single PR. For larger or more complex features, strongly consider feature flags or incremental delivery instead.

## Scaling & Operational Considerations

The most common failure mode is rebase cascade debt — a stack where lower PRs are receiving rapid review feedback while `main` is also actively changing, resulting in a complex web of rebases that produce subtle conflicts. This typically happens when the stack is too deep or when lower PRs are opened for review before they are truly ready.

Teams new to stacked PRs frequently open PRs that are not independently meaningful. They describe the PR as "part 2 of the auth feature" and assume reviewers have read part 1. Each PR in a stack should be understandable in isolation. A reviewer should not need to read PR #1 to evaluate PR #2. Writing PR descriptions that explain each layer's purpose in standalone terms takes extra time upfront but prevents confusion and re-review cycles later.

At team scale, stacking introduces a coordination challenge. If two engineers are working on different layers of the same stack, they need to communicate about base branch changes more actively than they would in independent parallel development. The rebase cascade is a shared responsibility, not just a personal one.

The performance implication is primarily in CI: a change to PR #1 triggers a new CI run on every dependent PR. For deep stacks on codebases with slow test suites, this can add significant wait time to every review iteration. Teams with CI run times over 15 minutes should be especially cautious about stacking more than two layers.

When a stack breaks down — typically because PR #1 undergoes a significant redesign during review — the right recovery is to pause and reassess the stack structure before rebasing. Sometimes the redesign of the foundation changes the right split points for the upper layers, and rebasing mechanically onto the redesigned foundation produces incoherent upper-layer diffs. In that case, it is faster to close the upper PRs and reopen them with updated descriptions and diffs once the new foundation is clear.

## Next Steps

- [What are Stacked PRs?](/learn/concepts/git/stacked-prs) — deeper explanation of the branching model and how stacked PRs appear in GitHub's interface
- [Parallel Development Workflow](./parallel-development) — when workstreams are independent rather than layered, this pattern avoids the rebase cascade entirely
- [Human-in-the-Loop Review Workflow](./human-in-the-loop-review) — how to give structured review feedback that the agent or a teammate can act on efficiently
- [Merge vs Rebase](/learn/concepts/git/merge-vs-rebase) — understanding the trade-offs between merge and rebase is essential for managing stacked PRs effectively
