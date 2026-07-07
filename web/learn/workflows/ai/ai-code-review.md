---
sidebar_position: 5
---

# AI Code Review Workflow

A workflow for using AI to review code changes — either as a standalone review tool or as a first-pass filter before human reviewers engage.

## Overview

AI code review is most effective as a layer in a pipeline rather than a replacement for human review. It catches a consistent class of issues — bugs, missing error handling, security patterns, obvious test gaps — at low cost and without queue time. Human reviewers can then focus on intent, architecture, and the questions AI can't answer.

This workflow applies whether you're reviewing your own code, agent-generated code, or a colleague's pull request.

## Step 1 — Define what you want the AI to focus on

AI reviewers produce better output when given a focus. A generic "review this code" prompt produces generic feedback. Instead, specify:

- **Bug search**: "identify logic errors, missing error handling, and incorrect assumptions"
- **Security review**: "look for injection risks, unsafe deserialization, overly permissive access, and hardcoded credentials"
- **Test coverage**: "identify changed logic that lacks corresponding test coverage"
- **Consistency**: "flag deviations from the patterns used in the rest of the codebase"

You can run multiple focused passes on the same diff — it's faster than trying to do all of them at once.

## Step 2 — Provide relevant context

AI reviewers work from what they can see. The more context they have, the better:

- Include the full diff, not just the changed lines
- Point to related files if the change interacts with code outside the diff
- Describe the intent: "this adds rate limiting to the public API" gives the reviewer a lens to apply

Without context, the AI reviews the code in isolation and misses issues that only appear when the change is understood in the context of the system.

## Step 3 — Triage the AI's findings

Not every AI finding is valid. Review each one:

- **Confirmed**: the AI identified a real issue — fix it
- **False positive**: the AI flagged something that's intentional or not a real problem — dismiss and note why, so the same flag doesn't recur
- **Uncertain**: you're not sure if it's a problem — investigate before dismissing

Over time, common false positives from your codebase will become familiar and quick to dismiss. Common true positives will become patterns to look for manually.

## Step 4 — Fix confirmed issues before human review

Address the issues the AI found before sending the code to a human reviewer. Human reviewers should focus on what AI can't cover — not on catching the same bugs an automated tool already flagged.

This also reduces back-and-forth on the review: the reviewer sees a diff that's already passed a mechanical check.

## Step 5 — Document patterns from false positives

When the AI consistently flags something that isn't a real issue in your codebase — a particular pattern that looks dangerous but is safe in context — document it. This informs how you prompt the reviewer in future and helps calibrate expectations for your team.

## Step 6 — Run human review

Human reviewers focus on:

- Does this change solve the right problem?
- Does the approach fit the architecture?
- Are there second-order effects not visible in the diff?
- Does it meet the team's standards for naming, structure, and documentation?

These questions require judgement that AI reviewers don't have.

## Using AI to review AI-generated code

When a coding agent produces the change being reviewed, AI review serves as a different kind of sanity check — one model reviewing another's output. This catches a meaningful fraction of errors before any human sees the diff.

The same workflow applies: focused prompt, review findings, fix confirmed issues, then human review.

## Related workflows

- [Human-in-the-Loop Review Workflow](/learn/workflows/git/human-in-the-loop-review)
- [AI Feature Development Workflow](./ai-feature-development)
- [AI Bug Fix Workflow](./ai-bug-fix)
