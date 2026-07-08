---
sidebar_position: 4
---

# Human-in-the-Loop Review Workflow

## Introduction

When an AI agent produces a code change, the change needs a human review before it merges. That review is not optional — it is the control point where correctness, scope, and quality are verified. The human-in-the-loop review workflow is the structured process for conducting that review, giving the agent actionable feedback, and iterating until the output is ready to merge.

This workflow is for engineers who are receiving code changes from AI agents and need to review them efficiently — without either rubber-stamping diffs or spending an hour on every one. The problem it solves is the gap between how humans typically review human-written code and what reviewing AI-generated code actually requires. AI agents work fast, produce diffs in short cycles, and respond well to precise structured feedback. An unstructured review process fails to take advantage of those properties: it either becomes a bottleneck that makes AI assistance useless, or it degrades into shallow approval that allows bad code to reach production.

After reading this article, you will know how to set up the review context so you are evaluating the right thing, how to review a diff at both the structural and logical levels, how to write feedback that the agent can act on in the next iteration, and how to decide when a change is ready to merge versus when to iterate or discard and re-prompt entirely.

## Understanding the Concept

The core idea is that review is a feedback loop, not a one-shot gate. A human-in-the-loop review does not aim to catch every possible issue in a single pass — it aims to give the agent precise, actionable feedback that results in a correct change with as few round-trips as possible. This is fundamentally different from reviewing human-written code, where a reviewer marks issues and the author decides how to address them. With an agent, the reviewer's feedback is the direct input to the next execution, so clarity and specificity matter more than completeness.

The mental model is that the agent is a capable but context-limited collaborator. It implemented what it understood the task to be, but it may have misunderstood scope, made incorrect assumptions about existing patterns, or handled edge cases incorrectly. The reviewer's job is to identify those gaps specifically and communicate them in a way the agent can act on — not to rewrite the code manually or accept the diff as-is to avoid the back-and-forth.

The "original task" is what the agent was asked to do and is the ground truth for scope. The "agent summary" is what the agent claims it did. The "diff" is what actually changed. "Structural review" checks files, size, and scope before reading individual lines. "Delta review" is the focused review of what changed between two agent iterations. This workflow is adjacent to AI code review — where the agent reviews human-written code — and to parallel development, which covers how multiple agent workstreams are managed simultaneously. Human-in-the-loop review is distinct because it is fundamentally about the feedback loop between human judgment and agent execution, not about the code review process itself.

## Applying It in Practice

The workflow begins before you open the diff. Pull up three things: the original task description you gave the agent, any summary or completion message the agent produced, and the raw diff. Read the task description first, then the agent's summary, then scan the diff structurally. Discrepancies between these three are your first signal that something went wrong — if the agent says it "updated the validation logic" but the diff also touches the email templates, something is out of scope and needs to be addressed before you read a single line of code.

The structural review comes before line-by-line reading. Which files changed? Are they the files you expected? Is the size of the diff proportionate to the task? A 30-line task producing a 400-line diff is a signal to look for scope creep or unnecessary refactoring before investing time in a close read. Check for new files that might duplicate existing utilities — agents sometimes implement a helper that already exists in the codebase under a slightly different name. Structural issues are faster to catch at this level than buried in code.

Once structure looks right, review the logic. Does the code do what the task required? Walk through the main path and at least one error path. Look for off-by-one errors, missing null checks, and incorrect conditionals. Check that the edge cases implied by the task are handled. Treat the code as if a capable but unfamiliar developer wrote it — assume good intent, but verify the details. Do not assume that passing tests mean the logic is correct; agents can write tests that validate their own incorrect assumptions.

When you find issues, write feedback that includes three components: where the issue is (file name and line range or function name), what is wrong (a specific statement of the problem), and what to do instead if you know — or the constraint to work within if you do not. For example: "In `auth/token.ts` at line 47, the expiry check compares against `created_at` but should compare against `expires_at`. The schema has an `expires_at` field on the token model." This gives the agent everything it needs to make a precise fix without re-reading the entire task. Avoid writing feedback as a revised task — "rewrite the auth module to be more robust" is a new task, not feedback on the current code.

Send all feedback in a single message, not one comment at a time. List issues in priority order — agents tend to work through a list sequentially, and if the critical issue is buried below minor style notes, it may receive less attention. For multiple issues, a numbered list works well: the agent can address each one and confirm what it changed.

After the agent updates the workspace, review the delta — what changed between the previous version and the current one. This is typically much smaller than the original diff and can be reviewed in a fraction of the time. Confirm that each piece of feedback was addressed, and check that the fixes did not introduce new issues. If everything looks right, run the test suite and merge. If issues remain, send another focused round of feedback using the same format. Most agent-produced changes should reach a mergeable state in one or two feedback rounds. If you are on the fourth round and each iteration introduces new issues while fixing old ones, the agent's approach is likely wrong at a fundamental level — stop iterating and consider discarding and re-prompting with a tighter, more specific task.

For teams managing multiple agents in parallel, time-boxing reviews helps maintain throughput. If a single diff is taking more than 20–30 minutes to review, either the task was too broad or the diff is too large. Both are upstream problems to solve at task-definition time, not during review.

## Engineering Decision Guide

The benefit of this workflow is precision and speed. Structured, targeted feedback gets the agent to a correct change faster than vague feedback or hoping the second attempt is better. A team that follows this workflow consistently develops a shared standard for what good feedback looks like and a predictable sense of how many rounds a normal change takes. That predictability is itself valuable — it lets the team plan review capacity against the volume of agent work in flight.

The trade-off is discipline. Writing precise, location-specific feedback is slower in the moment than writing "this doesn't look right." But the investment pays back in fewer iterations and less re-review time. Teams that skip the structured feedback step find themselves doing more rounds of review, not fewer, because the agent has to guess at what was wrong and often guesses incorrectly.

This workflow is appropriate whenever an AI agent produces code changes that a human is responsible for before merge — which is to say, always, unless the diff is trivially mechanical. If the agent's job was to update 40 import paths after a module rename, verification is a grep, not a structured review. Scale the rigor to the complexity of the change.

Do not use this workflow when the agent's output is so far from the intent that feedback would amount to re-specifying the entire task. In that case, discard and re-prompt with a clearer, narrower task. Do not continue iterating on an approach that is not converging — if the agent keeps making the same category of mistake (misunderstanding the data model, ignoring existing utilities, changing scope), the issue is in the task description, not in the feedback. Fix the task.

The alternative to structured review is ad-hoc approval: read the diff roughly, approve if it looks plausible. This is faster in the best case and significantly slower in the average case, because the mistakes that reach production come back as bugs requiring deeper investigation. The alternative to iterating with structured feedback is discarding and re-prompting immediately, which is the right call after the second failed iteration.

The recommendation is to use this structured workflow as the default for any agent-generated diff that touches logic or business rules. Make it routine: task description, structural check, logic check, targeted feedback, delta review, merge. The overhead per review round is small once the pattern is internalized, and the reduction in failed iterations and escaped bugs makes the investment worthwhile.

## Scaling & Operational Considerations

The primary failure mode is review becoming the bottleneck. When multiple AI agents produce diffs faster than the team can review them, the review queue builds up, agents sit idle waiting for feedback, and the throughput benefit of AI-assisted development disappears. The fix is either to reduce the number of concurrent agents or to reduce time per review — which means smaller tasks, tighter scoping, and better upfront context given to agents so the first diff is closer to correct.

A common mistake is treating the first diff as a proposal rather than as code under review. Teams sometimes respond to the first agent output with "looks good overall, a few tweaks" when a structural review would have revealed that the agent misunderstood the task entirely. Reading the original task description before opening the diff prevents this — it keeps the reviewer's evaluation anchored to what was actually requested.

At scale, human-in-the-loop review requires consistent review standards across a team. When different reviewers apply different standards to agent output, the feedback quality varies, and the agents (and the teams operating them) get inconsistent signals about what "good" means. A brief internal guide — what kinds of issues require feedback versus direct fixes, what the time-box thresholds are, when to discard and re-prompt — creates alignment without bureaucracy. It also makes onboarding new reviewers faster.

The operational overhead of this workflow scales with diff complexity, not diff count. A team can review ten simple mechanical diffs in the time it takes to review one complex architectural change. Scoping tasks to stay within a manageable complexity range — changes reviewable in 15–20 minutes — keeps the workflow sustainable over time. Large, open-ended tasks that produce diffs requiring an hour of review are the most common source of bottleneck and should be broken down before they reach the review stage.

When the workflow breaks down — typically because a complex change has been iterated so many times that neither the reviewer nor the agent has a clear picture of what the current diff is supposed to accomplish — the recovery is to start over. Close the PR, delete the workspace, rewrite the original task with clearer scope and more explicit context about existing code patterns, and run the agent fresh against a clean branch.

## Next Steps

- [What is Human-in-the-Loop Development?](/learn/concepts/ai-engineering/human-in-the-loop-development) — the broader practice of keeping humans in the decision loop during AI-assisted development
- [AI Code Review Workflow](/learn/workflows/ai/ai-code-review) — the complementary workflow where an agent reviews human-written code
- [Parallel Development Workflow](./parallel-development) — how to manage multiple agent workstreams running simultaneously while keeping reviews manageable
- [What is AI Code Review?](/learn/concepts/ai-engineering/ai-code-review) — the concept behind using AI for code review, distinct from this workflow's focus on humans reviewing AI output
