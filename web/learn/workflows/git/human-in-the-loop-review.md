---
sidebar_position: 4
---

# Human-in-the-Loop Review Workflow

A workflow for reviewing AI-generated code changes, providing structured feedback, and iterating with an agent until the output is ready to merge.

## Overview

When a coding agent produces a change, a human review step determines whether it ships. The quality of that review — and how feedback is communicated back to the agent — determines how quickly and reliably the workflow converges on mergeable output.

The goal is not to catch every possible issue in a single review pass. It's to give the agent precise, actionable feedback that results in a correct change with minimal back-and-forth.

## Step 1 — Set up the review context

Before reviewing, understand:

- **What the agent was asked to do** — the original task description, not the agent's summary of what it did
- **What the agent claims it did** — any summary or completion message the agent produced
- **What actually changed** — the raw diff

Discrepancies between the task, the agent's summary, and the actual diff are the first signal that something went wrong.

## Step 2 — Review the diff structurally first

Before reading individual lines, scan the diff structure:

- **Files touched**: are they the files you expected? Any unexpected changes outside the intended scope?
- **Size**: is the diff proportionate to the task? A 50-line task prompt producing a 1,200-line diff warrants scrutiny.
- **New files**: does any new file duplicate something that already exists?

Structural issues are faster to catch at this level than line by line.

## Step 3 — Review logic and correctness

Read the changed code critically:

- Does it do what the task required?
- Are error paths handled?
- Are there off-by-one errors, incorrect conditionals, or missing null checks?
- Does it handle the edge cases the task implied?

Treat the code as if a junior developer wrote it — assume good intent but verify the details.

## Step 4 — Write targeted feedback

When you find an issue, write feedback that specifies:

- **Where**: the file and line range
- **What's wrong**: a clear statement of the problem, not just "fix this"
- **What to do instead**: if you know the right approach, say so; if you don't, describe the constraint and let the agent find the solution

Avoid writing feedback as a revised task description. "Rewrite the auth module" is a new task; "the token expiry check at line 47 compares against the wrong timestamp field" is feedback on the current work.

## Step 5 — Send feedback to the agent

Give the agent your specific comments and ask it to address them in the same workspace. The agent can see the current code and the diff, so it has full context.

For multiple issues, list them in priority order. Agents tend to address items in order; if the most important issue is buried in the list, it may receive less attention.

## Step 6 — Review the updated diff

After the agent updates the workspace, review the delta — what changed between the previous version and the current one. This is typically much smaller than the original diff and faster to verify.

Confirm that:
- Each piece of feedback was addressed
- The agent didn't introduce new issues while fixing the old ones
- The overall diff still looks correct

## Step 7 — Merge or iterate

If the diff is clean, run tests and merge. If there are remaining issues, repeat the feedback cycle. Most changes should reach a mergeable state in one or two iterations. If you're on iteration four or five, step back and reassess whether the agent's approach is fundamentally sound — it may be faster to discard and re-prompt.

## Maintaining review throughput

Human review is the bottleneck in AI-assisted development. A few practices that help:

- **Time-box reviews**: if a review is taking more than 30 minutes, the diff is probably too large or the task was too broad
- **Batch related feedback**: send all feedback for a review in one message, not one comment at a time
- **Build a feedback vocabulary**: reusable phrases for common issues ("use the existing `validateUser` utility rather than re-implementing validation") reduce the time spent writing feedback

## Related concepts and workflows

- [What is Human-in-the-Loop Development?](/learn/concepts/ai-engineering/human-in-the-loop-development)
- [AI Code Review Workflow](/learn/workflows/ai/ai-code-review)
- [Parallel Development Workflow](./parallel-development)
