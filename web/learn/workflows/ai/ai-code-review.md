---
sidebar_position: 5
---

# AI Code Review Workflow

## Introduction

The AI code review workflow uses an AI model as a structured first-pass reviewer on code changes — your own, a colleague's, or output from a coding agent. The problem it solves is the cost and variability of early-stage review: catching bugs, missing error handling, security gaps, and obvious test coverage problems before they reach human reviewers or production. AI review is fast, available at any time, and applies the same attention to every diff regardless of size or timing.

This workflow suits any engineer or team that reviews code regularly. It's particularly valuable when reviewing agent-generated code, where one model reviewing another's output catches a meaningful fraction of errors before any human sees the diff. It also helps in high-throughput teams where human reviewer time is the bottleneck.

After working through this workflow, you'll know how to focus an AI reviewer to produce actionable rather than generic output, how to triage findings efficiently, and how to integrate AI review into the broader review pipeline alongside human judgment.

## Understanding the Concept

The core idea is that AI review is a layer in a pipeline, not a replacement for human review. An AI reviewer is fast, consistent, and tireless. It applies the same level of attention to every line, at any time, with no queue delay. It catches a reliable class of issues: logic errors, missing error handling, security patterns, null pointer risks, test gaps. These are mechanical catches that don't require understanding intent or architecture.

Human reviewers bring what AI cannot: understanding of intent ("does this solve the right problem?"), architectural judgment ("does this fit the system?"), and awareness of second-order effects ("what does this change in six months?"). The workflow is designed to route each type of concern to the reviewer best suited to catch it, so neither type of review is being asked to do what it's bad at.

The key concept is focus. A generic "review this code" prompt produces generic output — broad, low-confidence findings that are easy to dismiss. A focused prompt ("look specifically for injection risks and hardcoded credentials in this diff") produces actionable findings worth triaging carefully. Running multiple focused passes on the same diff is more effective than running one broad pass, and the overhead of multiple passes is low.

This workflow is adjacent to the [AI Feature Development Workflow](./ai-feature-development) — AI review is the natural first step after an agent produces a diff, before it reaches human reviewers. It's directly upstream of the [Human-in-the-Loop Review Workflow](/learn/workflows/git/human-in-the-loop-review), which it feeds. The workflow exists as a distinct pattern because review requires a different posture than implementation: the goal is to find what's wrong, not to produce something new.

## Applying It in Practice

Begin by deciding what you want the review to focus on before writing the prompt. The focus determines the usefulness of the output. Common focus areas include: bug search ("identify logic errors, missing error handling, and incorrect assumptions in the changed code"), security review ("look for injection risks, unsafe deserialization, overly permissive access checks, and hardcoded credentials"), test coverage ("identify changed logic that lacks corresponding test coverage"), and consistency ("flag deviations from the patterns used in the rest of the codebase"). You can run multiple passes with different focus areas on the same diff — it's more productive than trying to cover all of them in one prompt.

Prepare the context before submitting. Include the full diff, not just the changed lines — the AI needs surrounding context to evaluate changes correctly. Point to related files if the change interacts with code outside the diff. Include a one-sentence description of the change's intent: "this adds rate limiting to the public API" gives the reviewer a lens to apply. Without intent context, the AI reviews the code as an isolated artifact and misses issues that only appear when the change is understood in the context of the system it lives in.

When the AI returns its findings, triage each one before acting on it. A finding is either confirmed (a real issue — fix it before the next step), a false positive (something intentional or not actually a problem — dismiss it and note briefly why), or uncertain (you're not sure whether it's a problem — investigate before dismissing, since uncertainty usually means the code is at least unclear). Don't collapse this into a binary. The uncertain category is where real bugs often hide, and it's the one that deserves the most careful attention.

Fix confirmed issues immediately, before sending the code to human reviewers. The goal is for human reviewers to focus their time on what AI can't catch — intent, architecture, second-order effects — not on re-catching the same bugs an automated pass already flagged. A diff that's passed AI review arrives at human review pre-screened, reducing review time and reducing the back-and-forth that slows down merges.

Document false positive patterns as they accumulate. When the AI consistently flags a particular pattern that's safe in your codebase — a specific use of `unsafe` in Rust, a deliberate exception swallow with a comment explaining why, a pattern that looks like a SQL injection risk but is correctly parameterised — write it down. This informs how you focus future prompts and helps calibrate expectations across the team, so the same false positives don't consume triage time repeatedly.

The final step is human review, operating on a diff that's already been mechanically checked. Human reviewers should focus on: does this change solve the right problem? Does the approach fit the architecture? Are there second-order effects not visible in the diff? Does it meet the team's naming, structure, and documentation standards? These questions require judgment that AI review doesn't provide and shouldn't be asked to provide.

When reviewing AI-generated code specifically, the same workflow applies — but the failure modes are different. Agent output tends to be syntactically clean and structurally plausible, which makes it easy to approve quickly. The issues tend to be in edge cases the agent didn't consider, tests that are structured but not meaningful, and patterns that diverge from the codebase and accumulate as technical debt. Focus AI review of agent-generated code specifically on edge cases, error paths, and whether tests cover the right scenarios rather than just passing.

## Engineering Considerations

The primary benefit is speed and consistency. AI review is available immediately, applies the same attention to every change regardless of diff size or time of day, and costs significantly less reviewer time for the mechanical class of issues it catches reliably.

The trade-offs are meaningful. AI review produces false positives that require triage time — a poorly focused prompt can generate more noise than signal. Without a focused prompt, output quality drops significantly. AI reviewers don't understand intent, architecture, or organisational context, which means they can miss the most important issues in a diff while flagging minor ones. And an AI review treated as authoritative — approved and merged without human review — removes the human judgment that the workflow is designed to preserve.

This workflow is appropriate for any team doing regular code review, especially teams with high PR throughput, teams reviewing agent-generated code, or teams where the mechanical class of bugs (error handling, security patterns, test gaps) is a recurring source of post-merge issues. It is not appropriate as a replacement for human review. Using AI review as the only review step trades short-term speed for long-term risk in a way that tends to surface as a cluster of production incidents rather than a single obvious failure.

The simpler alternative is running a linter or static analysis tool, which is faster and produces zero false positives for the rules it covers. Static analysis is the right choice for patterns that can be expressed deterministically. AI review adds value for issues that require semantic understanding — logic errors, missing edge cases, security reasoning that depends on context — that linters can't express as rules.

The more complex alternative is building automated AI review into CI so that findings surface as PR comments without a manual invocation step. This is a worthwhile investment for teams with high PR volume, but adds operational overhead and requires maintaining the prompt and triage conventions as the codebase evolves.

Clear recommendation: use AI review as a first pass on every non-trivial diff. Focus the prompt on one or two areas per pass. Fix confirmed findings before human review. Treat the output as input to triage, not a verdict.

## Scaling & Operational Considerations

The most common failure mode at team scale is treating AI review as a rubber stamp. When findings are dismissed without reading them ("it's just noise"), the review pass produces no value and the overhead is pure cost. The discipline of actually triaging each finding — which takes minutes per diff — is what makes the workflow worthwhile. If triage consistently takes longer than it's worth, the problem is usually an unfocused prompt, not the workflow itself.

A second failure mode is prompt entropy: over time, the review prompt becomes generic because no one maintains it. Start with a focused prompt and revisit it quarterly. If the false positive rate is high, the prompt is too broad. If real bugs are getting through, the prompt is missing key focus areas. Treat the prompt as a maintained artifact, not a one-time setup.

A third issue is reviewer calibration. Different engineers will triage the same finding differently — one dismisses it as a false positive, another treats it as uncertain. Without shared standards, the review process becomes inconsistent and findings from the same pattern are handled differently depending on who's reviewing. Documenting common false positive patterns and establishing shared triage conventions resolves this at the cost of some upfront work.

Security considerations apply to what's included in the context sent to the AI reviewer. The diff may contain sensitive logic, internal API structures, or proprietary business rules. For highly sensitive changes, confirm that your AI provider's data handling is acceptable before including them in review prompts. This is an operational constraint that varies by team, by provider, and by the sensitivity of the code in question.

At scale, AI review pairs well with automation: running the review pass in CI and surfacing findings as PR comments removes the manual invocation step and makes findings part of the PR record. Teams that instrument this can track pattern data over time — which finding types are most common, which are most often dismissed, which categories correlate with post-merge bugs — and use it to improve both their code and their prompts over time.

The maintenance burden is low: the main ongoing work is keeping the false positive documentation current and revisiting the prompt focus as the codebase evolves. The workflow degrades gracefully if maintenance is neglected — the false positive rate rises and triage takes longer, but the workflow doesn't break entirely. High triage cost is the signal to revisit the prompt.

## Next Steps

- [Human-in-the-Loop Review Workflow](/learn/workflows/git/human-in-the-loop-review) — the human review step that follows AI review in the pipeline, focused on intent and architecture
- [AI Feature Development Workflow](./ai-feature-development) — use AI review as the structured first pass on diffs that a coding agent produces
- [What is AI Code Review?](/learn/concepts/ai-engineering/ai-code-review) — foundational concept behind this workflow
- [What is Human-in-the-Loop Development?](/learn/concepts/ai-engineering/human-in-the-loop-development) — the broader framework this workflow sits within
