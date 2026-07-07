---
sidebar_position: 3
---

# AI Bug Fix Workflow

A workflow for using a coding agent to investigate and fix bugs — with emphasis on reproducing the problem first and verifying the fix doesn't introduce regressions.

## Overview

Bug fixing is one of the strongest use cases for coding agents. The agent can read stack traces, search across files, trace call chains, and produce a fix — tasks that are mechanical but time-consuming for a human. The human's role is to confirm the fix is correct and complete, not to find it.

The failure mode to avoid is accepting a fix that makes the symptom disappear without addressing the root cause. An agent under pressure to produce output will sometimes patch the visible error without understanding why it occurs.

## Step 1 — Document the bug clearly

Before handing off to an agent, write down:

- **Reproduction steps**: exact inputs or actions that trigger the bug
- **Expected behaviour**: what should happen
- **Actual behaviour**: what happens instead, including any error messages or stack traces
- **Context**: environment, version, whether it's intermittent

A well-documented bug report is a good agent prompt. An agent given "it crashes sometimes" will produce speculative fixes.

## Step 2 — Create a workspace for the fix

Work in an isolated workspace so the investigation doesn't touch in-progress features. If the bug is in production, branch from the stable release tag rather than the current development branch.

## Step 3 — Ask the agent to reproduce before fixing

Instruct the agent to write a failing test that demonstrates the bug before attempting a fix. This has two benefits:

1. It confirms the agent understood the bug correctly
2. It provides a regression test that prevents the same bug from returning

If the agent can't write a test that fails in the expected way, it doesn't yet understand the problem. Clarify and try again before accepting any code changes.

## Step 4 — Review the root cause explanation

Before reviewing the fix itself, ask the agent to explain what caused the bug. A correct explanation gives confidence in the fix. A vague or incorrect explanation is a signal that the fix may be superficial.

This step is quick — a sentence or two from the agent — but it filters out a class of incorrect fixes early.

## Step 5 — Review the fix

With the root cause understood, review the diff:

- Does the fix address the root cause or just suppress the symptom?
- Are there other call sites or components where the same bug could appear?
- Does the fix have unintended side effects?
- Does the previously-failing test now pass?

If the same bug pattern exists elsewhere in the codebase, ask the agent to search for and fix those as well before closing the workspace.

## Step 6 — Run the full test suite

Run all tests, not just the new one. Bug fixes frequently break adjacent behaviour because the buggy code was being relied upon in unexpected ways elsewhere.

## Step 7 — Merge

Once tests pass and the diff is clean, merge. For production bugs, follow your team's deployment process. The workspace and its fix commit serve as a clear record of what changed and why.

## Tips

- Don't give the agent the fix — give it the symptom. An agent told "the problem is X, fix it by doing Y" will do Y without evaluating whether Y is correct.
- For intermittent bugs, ask the agent to add logging or assertions first, so you can gather more information before attempting a fix.
- For bugs in third-party code, ask the agent to identify the exact version and behaviour, then write a workaround rather than patching the dependency directly.

## Related workflows

- [AI Feature Development Workflow](./ai-feature-development)
- [AI Refactoring Workflow](./ai-refactoring)
- [Human-in-the-Loop Review Workflow](/learn/workflows/git/human-in-the-loop-review)
