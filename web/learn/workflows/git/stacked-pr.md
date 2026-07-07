---
sidebar_position: 2
---

# Stacked PR Workflow

A workflow for breaking large features into a chain of reviewable pull requests — each building on the previous — so reviewers get focused diffs and work moves forward without waiting for the full feature to be complete.

## Overview

Stacked PRs work best for features that have natural layers: a schema change, then the business logic that uses it, then the API that exposes it, then the UI. Each layer is meaningful on its own, and a reviewer can evaluate each without needing to understand the whole.

The operational challenge is keeping the stack aligned when lower branches change. This workflow covers how to structure, manage, and merge a stack without losing work or producing broken intermediate states.

## Step 1 — Identify natural split points

Before writing code, identify where the feature has seams:

- **Data layer changes**: schema migrations, new models, updated types
- **Logic layer changes**: business rules, service classes, utility functions
- **Interface layer changes**: API endpoints, UI components, CLI commands
- **Test layer changes**: integration tests that span the previous layers

Not every feature splits cleanly at these boundaries. If the layers are tightly coupled, a stack may not be the right approach — a single PR is simpler to manage.

## Step 2 — Create a workspace per layer

Create one workspace per PR in the stack. Each workspace checks out a branch that targets the previous branch in the stack — not `main`.

```
main
└── feature/auth-tokens          ← workspace-1, targets main
    └── feature/auth-middleware  ← workspace-2, targets feature/auth-tokens
        └── feature/auth-ui      ← workspace-3, targets feature/auth-middleware
```

Open each workspace and implement only the work for that layer. Keeping layers separate prevents changes from bleeding across PR boundaries.

## Step 3 — Open PRs from the bottom up

Once the foundation layer is ready for review, open its PR targeting `main`. Open subsequent PRs targeting the branch below them in the stack. This lets reviewers start on PR #1 immediately while you continue implementing PR #2 and PR #3.

Each PR's diff should show only what that layer adds, not the full feature.

## Step 4 — Respond to review feedback

When a reviewer comments on PR #1, address it in workspace-1. Commit the fix.

This is where stacks become operationally complex: a commit on PR #1 changes the base for PR #2, which changes the base for PR #3. Rebase each dependent workspace onto the updated branch below it after any base change.

Keeping the stack shallow (two or three levels) makes this manageable. Deep stacks with frequent changes to lower layers create significant rebase overhead.

## Step 5 — Merge from the bottom up

Merge PR #1 into `main` first. GitHub will automatically update PR #2's base to `main` after the merge — its diff will now show only what PR #2 adds on top of what PR #1 introduced.

Review PR #2, address feedback, merge. Repeat for PR #3.

Never merge out of order. A PR whose base hasn't merged yet will produce a diff that mixes its changes with those of the unmerged base.

## Step 6 — Clean up workspaces

Once all PRs in the stack are merged, delete the workspaces. Their commits live in the main branch history; the workspaces are no longer needed.

## Tips

- Keep each PR below 400 lines of diff where possible. Above this threshold, reviewer attention drops and review quality degrades.
- Write a description in each PR that explains what it does in isolation, not "part 2 of the auth feature." Reviewers shouldn't need to read PR #1 to understand PR #2.
- If the stack grows beyond three layers, consider whether the feature can be delivered incrementally — shipping PR #1 and #2 to production before finishing #3 — rather than holding everything until the stack is complete.

## Related concepts and workflows

- [What are Stacked PRs?](/learn/concepts/git/stacked-prs)
- [Parallel Development Workflow](./parallel-development)
- [Human-in-the-Loop Review Workflow](./human-in-the-loop-review)
