---
sidebar_position: 12
description: Review pull requests written by coding agents with a checklist for scope, tests, risk, and feedback that the agent can apply.
---

# Review AI-Generated PRs

_Inspect agent pull requests for scope, correctness, and risk before you approve them._

## Goal

Review a pull request produced by a coding agent without rubber-stamping a plausible diff, and return feedback the agent can apply cleanly.

## Before you open the diff

Collect three inputs:

1. The original task or prompt
2. The agent's summary of what it changed
3. The pull request diff against the intended base

If the summary and diff disagree with the task, stop. Correct the task or reject the PR. Do not review a solution to the wrong problem.

Confirm CI status for build, lint, and tests. Failing checks are not a substitute for review, but passing checks are not approval either.

## Review checklist

Work through the PR in this order:

**Scope**

- Are the changed files expected for the task?
- Did the agent add dependencies, config, or generated files?
- Is there unrelated cleanup or reformatting?

**Behavior**

- Does the main success path match the acceptance criteria?
- Are authorization, validation, and error paths handled?
- Do migrations or API changes preserve compatibility?

**Tests**

- Do tests fail when the implementation is wrong?
- Did the same agent write both code and tests with one shared assumption?
- Are edge cases named in the task covered?

**Design**

- Does the change reuse existing helpers and patterns?
- Is the size proportionate to the task?
- Would a maintainer understand this in six months?

**Risk**

- What risk class is this change: low, medium, high, or critical?
- Does the reviewer have enough domain context to approve it?

## Giving feedback agents can use

Write comments that name a location, a defect, and a constraint:

```text
In src/auth/token.ts, validateExpiry compares now with created_at.
Use expires_at from the token record. Add a test for an expired token
whose created_at is still within the session duration.
```

Avoid vague notes such as "clean this up" or "add better errors." An agent will guess, and the next revision will create new noise.

Send related findings together. Rank correctness and security above style. After the agent revises, review the delta first, then re-read the full final diff before approval.

## Local review in Treq

Treq can review workspace changes before a remote PR exists. Comment on changed lines, finish the review, and send the prompt back to the agent in plan or edit mode. See [Changes and Reviews](/docs/concepts/changes-and-reviews) and [Human in the Loop AI Code Review](/learn/ai-code-review).

## Common failure cases

Rubber-stamping a large agent PR. Reviewers skim when the diff is too big. Split the work into a [stack](/learn/stacked-prs) or reject and ask for a narrower task.

**Approving because CI is green.** Agents can satisfy tests they wrote. Trace behavior against the acceptance criteria.

**Editing the PR heavily by hand.** Silent rewrites hide broken prompts and repo guidance. Prefer feedback and a revision round, with a restart when the approach is wrong.

**Leaving the branch stale during review.** Rebase or auto-rebase before final approval so you are not merging against an old base. See [Auto-Rebasing AI Workspaces](/learn/how-to/auto-rebase-ai-branches).

## Related

- [Human in the Loop AI Code Review](/learn/ai-code-review)
- [AI Code Review Workflow](/learn/workflows/ai/ai-code-review)
- [Human-in-the-Loop Review Workflow](/learn/workflows/git/human-in-the-loop-review)
- [Code Review Workflow](/docs/tutorials/code-review-workflow)
