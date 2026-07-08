---
sidebar_position: 3
---

# AI Bug Fix Workflow

## Introduction

The AI bug fix workflow is a structured approach for using a coding agent to investigate and resolve bugs: from documenting the problem through to a tested, merged fix. The problem it addresses is investigation time: tracing a bug through stack frames, searching for where state is set, reading call chains across files. These are mechanical tasks that an agent performs faster than a human, freeing the engineer to focus on evaluating whether the fix is correct and complete.

This workflow suits engineers dealing with clearly reported bugs where reproduction steps are known or discoverable. It's especially useful for bugs in unfamiliar parts of the codebase, where the agent's ability to search broadly is most valuable. It's less suited to intermittent or environment-specific bugs where reproduction is itself the hard problem.

After working through this workflow, you'll know how to structure a bug report that produces useful agent output, why reproduction-first is the right discipline, and how to distinguish a genuine root-cause fix from symptom suppression.

## Understanding the Concept

The central mental model is: a bug is a deviation between expected and actual behaviour caused by something specific and findable. The agent's job is to find that thing, prove it with a failing test, fix it at the source, and confirm the fix with a passing test. The engineer's job is to verify that the agent's explanation is correct and that the fix doesn't introduce new problems.

The failure mode this workflow is designed to prevent is symptom suppression: a fix that makes the visible error disappear without addressing why it occurred. An agent optimising for output will sometimes patch the error directly — swallowing an exception, returning a default instead of computing the correct value — without understanding the root cause. These fixes often introduce harder-to-trace problems downstream.

The reproduction-first discipline is what separates good bug fixes from symptom patches. If the agent writes a failing test before touching any production code, you have evidence it understood the problem. If the test passes after the fix, you have evidence the fix is correct. If the test can't be made to fail in the expected way, something about the problem statement is wrong — clarify before proceeding.

This workflow sits adjacent to the [AI Refactoring Workflow](./ai-refactoring), because bug fixes sometimes reveal structural problems that warrant a follow-up refactoring once the immediate issue is resolved. It connects to the [Human-in-the-Loop Review Workflow](/learn/workflows/git/human-in-the-loop-review) for the post-fix review step. The AI bug fix workflow exists as a distinct pattern because bugs require diagnosis before implementation — you can't define the task without first understanding the problem, which changes how you interact with the agent compared to a feature request.

## Applying It in Practice

Begin by documenting the bug before handing off to the agent. Write down the exact steps to reproduce it, what the expected behaviour is, what actually happens (including the full error message or stack trace if available), and any relevant context about the environment or conditions. A one-line bug report ("it crashes sometimes") produces speculative fixes. A detailed report — exact inputs, exact error, exact environment — produces targeted investigation.

Create a dedicated workspace for the fix. If the bug is in a deployed version, branch from the release tag rather than the current development branch — you want to reproduce the bug in the environment where it exists, not in a branch that may have unrelated changes masking or altering the behaviour.

Open the agent session in the workspace with the documented bug report as the prompt. The first instruction to the agent should be explicit: write a failing test that reproduces the bug before attempting any fix. Paste the reproduction steps and the expected vs. actual behaviour. Let the agent search the codebase, read relevant files, and produce the failing test.

Review the test before proceeding. Run it manually to confirm it fails for the expected reason. If the test passes (meaning it doesn't reproduce the bug), or if it fails for a different reason than the one described, the agent hasn't understood the problem. Give it more context and iterate on the test before moving to a fix. This check is the most important gate in the entire workflow.

Once the failing test is confirmed, instruct the agent to explain the root cause in plain language before writing the fix. A clear explanation — "the bug occurs because the session token is not being invalidated after logout, so the authentication middleware accepts expired tokens" — gives you a basis for evaluating the fix. A vague explanation ("something is wrong with the authentication flow") is a signal that the fix will be superficial.

With the root cause understood, let the agent produce the fix. Review the diff: does the fix address the root cause, or does it just suppress the symptom? Are there other places in the codebase where the same pattern appears and the same bug could exist? Does the fix have side effects on adjacent behaviour? Run the failing test — it should now pass. Then run the full test suite to check for regressions introduced by the fix.

If the same bug pattern exists elsewhere, ask the agent to search for and fix those occurrences before closing the workspace. Once everything passes, merge the workspace and follow your team's deployment process. The workspace serves as a clear record of the investigation, the root cause, and the fix — useful context if the same area is touched again.

## Engineering Considerations

The main benefit of this workflow is investigation speed. An agent that can search the full codebase, read stack traces, and trace call chains can narrow down a bug's location in minutes. For unfamiliar codebases or complex multi-file bugs, this difference is significant. Hours of detective work compress to an agent session.

The trade-offs are important. The workflow requires a human who can evaluate root cause explanations critically. An agent's confidence in its explanation is not a reliable indicator of correctness. The reproduction-first discipline adds a step compared to asking for a fix directly, but that step is what makes the output trustworthy enough to merge.

This workflow is appropriate when the bug is clearly reported, reproduction steps are known or discoverable, and the codebase has at least partial test coverage to run as a regression check. It is not appropriate for bugs that require deep runtime observation — profiling, memory analysis, network captures — that the agent can't access, or for environment-specific bugs that can't be reproduced in the workspace. In those cases, use the agent for searching and hypothesising but do the verification manually.

The simpler alternative is asking the agent for a fix directly, without the reproduction-first discipline. This is faster when the bug is obvious and the risk of symptom suppression is low — a typo, a clearly off-by-one error, a missing null check. The reproduction-first discipline adds the most value for non-obvious bugs where the fix is not self-evident and the consequences of a wrong fix are significant.

Avoid giving the agent the proposed fix along with the bug report ("the problem is X, fix it by doing Y"). An agent given a prescribed solution will implement it without evaluating whether it's correct. Give it the symptom and let it find the cause.

Clear recommendation: always ask the agent to reproduce before fixing. The failing test is the most important output of the workflow — it's evidence of understanding and a regression guard that prevents the same bug from returning silently.

## Scaling & Operational Considerations

The most common failure mode is skipping the reproduction step under time pressure. When a production incident is ongoing, the temptation is to accept the first plausible fix without confirming it addresses the root cause. This frequently leads to a second incident caused by the incomplete fix. The workflow's discipline is most important precisely when the pressure to skip it is highest.

A second failure mode is accepting a fix without searching for similar patterns elsewhere. A bug caused by a misuse of an API or a wrong assumption often appears in multiple places across the codebase. Fixing one instance and shipping leaves the others to surface as separate incidents, each requiring its own investigation.

A third issue is intermittent bugs, where the agent can't write a reliably failing test because the trigger condition is probabilistic or environment-dependent. In these cases, use the agent to add logging or assertions to gather more information in production first, then return to the full workflow once the failure mode is better understood. Don't accept a speculative fix for an intermittent bug.

At team scale, the workflow is straightforward to apply consistently because the steps are concrete and auditable: you can see whether a failing test exists in the PR, whether the root cause explanation is in the commit message or PR description, and whether the full suite passed. Teams that add these as checklist items on their review template get compliance without friction.

For high-severity production bugs, keep the workspace a bit longer as a reference before deleting it — the commit history of the investigation can be valuable if related bugs surface later. For frequent bug categories (a particular class of input validation error, a consistent misuse of a library), build a library of task description templates that already include the structure needed for a good agent prompt.

When a fix causes a regression — which happens when side effects weren't fully understood — roll back the merge, revisit the root cause explanation, and look for what the agent missed. The failing test from the original bug should still be in history and can be reused as a starting point for the second investigation.

## Next Steps

- [AI Feature Development Workflow](./ai-feature-development) — apply the same workspace discipline to new feature implementation
- [AI Refactoring Workflow](./ai-refactoring) — follow up on a bug fix with structural improvements when the root cause reveals deeper problems
- [Human-in-the-Loop Review Workflow](/learn/workflows/git/human-in-the-loop-review) — the human review step that follows the AI investigation and fix
- [What are Coding Agents?](/learn/concepts/ai-engineering/coding-agents) — foundational concept behind this workflow
