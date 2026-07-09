---
sidebar_position: 4
---

# AI Refactoring Workflow

## Introduction

The AI refactoring workflow is a structured approach to using a coding agent to improve code structure, readability, or organisation without changing observable behaviour. The problem it solves is the mechanical cost of refactoring at scale: finding every call site, updating every import, renaming every reference, moving every type consistently. These tasks are tedious, error-prone across large codebases, and time-consuming for humans — but well within the capabilities of a coding agent given clear scope.

This workflow suits engineers who want to improve a codebase incrementally and need confidence that no behaviour has changed in the process. It's particularly valuable for large codebases where a human working alone might miss call sites or lose track of the scope of changes. It works best on code that has meaningful test coverage — without tests, there's no safety net.

After working through this workflow, you'll know how to scope a refactoring precisely, verify safety before starting, break large changes into reviewable increments, and confirm semantic equivalence when reviewing the diff.

## Understanding the Concept

The core idea behind refactoring is behaviour preservation: the code does exactly the same thing as before, expressed differently. This is distinct from a feature change (new behaviour) or a bug fix (correcting wrong behaviour). The distinction matters because the review question changes: you're not asking "is this correct?" — you're asking "is this equivalent?"

Coding agents are well-suited to refactoring because the work is structural and mechanical. Moving a module, extracting a class, renaming a function, updating all callers: these tasks require reading widely, writing precisely, and making no product judgements. An agent is faster than a human at all three, and it doesn't lose track of call sites the way a human working across many files tends to.

The primary risk is drift: the agent refactors beyond the defined scope, makes "improvements" that change behaviour subtly, or updates tests in ways that weaken their coverage. The discipline that prevents drift is explicit scope definition at the start and semantic equivalence checking at the review. These two constraints are the entire workflow in compressed form.

The second most important concept is commit separation: refactoring commits must be kept strictly separate from feature commits. A refactoring mixed into a feature change is hard to review (is this a real change or a rename?) and hard to revert (which parts belong to the feature?). Keeping them separate is a prerequisite for the workflow to be useful at all — not an optional discipline.

This workflow is adjacent to the [AI Feature Development Workflow](./ai-feature-development), sharing the workspace model and the iterative review discipline, but with a fundamentally different review goal. It connects to the [AI Bug Fix Workflow](./ai-bug-fix) because bug fixes sometimes reveal structural problems that warrant a follow-up refactoring once the immediate issue is resolved. The [Rust Refactoring Workflow](/learn/workflows/stacks/rust-refactoring) applies these principles using Rust-specific tooling including Clippy and `cargo fix`.

## Applying It in Practice

Start by defining the refactoring target in concrete terms before opening the agent session. Specify what to change ("extract the authentication logic from `UserController` into a dedicated `AuthService`"), what not to change ("do not alter any API signatures visible to callers outside this module"), and what success looks like ("all existing tests pass, no changes to public interfaces"). Avoid open-ended prompts like "clean up this file" — they produce wide, unfocused diffs that are hard to reason about and harder to review.

Before touching any production code, ask the agent to assess test coverage on the files being changed. If coverage is adequate, proceed. If it's insufficient, instruct the agent to write characterisation tests first — tests that document the current behaviour without passing judgement on whether it's correct. These tests are the safety net. Skipping this step means the refactoring has no verification mechanism and regressions can reach production undetected. This is not optional; it's the gate that makes the rest of the workflow trustworthy.

For anything beyond a small rename, break the work into sequential stages committed separately. The first stage is move without changing: relocate the module, extract the class, or separate the file with no alterations to logic. The second stage is update callers: revise all call sites to reference the new location or interface. The third stage is cleanup: remove dead code, update imports, apply renames that improve clarity. Reviewing three small diffs is substantially easier than reviewing one large one, and each commit is independently revertable if something breaks post-deploy.

When reviewing each stage, focus specifically on semantic equivalence rather than correctness in the feature sense. Check that control flow is preserved — conditionals, loops, and early returns should match the original exactly. Verify that side effects (logging, metrics, cache invalidation, event emission) are still triggered in the same order and under the same conditions. Watch for type signature changes that could affect runtime behaviour. Pay close attention to null and empty cases, which are the most common source of subtle regression in refactorings.

After all stages, run the full test suite. Any failure requires investigation: it's either a regression introduced by the refactoring or a gap in coverage that the refactoring exposed. Both must be addressed before merging. Once all tests pass, merge as a standalone commit with a message that clearly identifies it as a refactoring — this makes it easy to identify in history and easy to bisect around if a post-deploy issue is traced back to the structural change.

For smaller changes on codebases with strong test coverage, one or two stages may be sufficient. For large-scale restructuring across many modules, a plan with four or five incremental commits is more manageable. The key constraint throughout is that no single commit should be too large to review carefully in a single session.

## Engineering Considerations

The primary benefit of this workflow is accuracy at scale. An agent updates every call site, every import, and every reference — consistently and without fatigue. On a large codebase, this is the difference between a refactoring that takes a week of careful human work and one that takes an hour of agent work plus a morning of review.

The trade-offs are significant. The workflow requires meaningful test coverage as a prerequisite — it doesn't create safety, it relies on safety that already exists. It also requires a reviewer who can evaluate semantic equivalence, which is a different skill from evaluating feature correctness. And it requires disciplined scope management: an agent given permission to "improve" code will find many ways to do so, not all of them safe or within the intended scope.

This workflow is the right choice when the refactoring target is clearly defined, test coverage is adequate, and the refactoring is separable from in-progress feature work. It is not appropriate when the codebase has poor test coverage and there's no time to write characterisation tests first — the risk of undetected regression is too high. It's also not appropriate when the refactoring is entangled with a feature change that can't be decoupled, or when the scope is still being worked out. In those cases, a smaller, more targeted change or a manual approach is safer.

The simpler alternative is making the refactoring manually with IDE support (rename, extract, move). This is appropriate for small, well-understood changes in familiar code. The AI workflow adds value when the scope is too large for IDE tools, when the codebase is unfamiliar, or when consistency across many files is required. The more complex alternative is automated codemods for language-specific transformations — faster than an agent for well-defined transformations but limited to what the codemod can express.

Clear recommendation: define scope precisely, verify coverage before starting, and keep refactoring commits separate from feature commits. The discipline is the workflow — without it, the agent produces a large diff that's fast to generate and slow to trust.

## Scaling & Operational Considerations

The most common failure mode is insufficient test coverage before the refactoring begins. When there's no safety net, subtle regressions go undetected until they surface in production. The fix is always the same: write characterisation tests before the refactoring, not after. Under time pressure this step is often skipped, and it's precisely when time pressure is highest that a missed regression does the most damage.

A second common mistake is allowing the agent to update tests during the refactoring phase. Updated tests are a signal of changed behaviour, which is what the refactoring is supposed to avoid. Instruct the agent explicitly not to modify tests during the structural change. If test updates are genuinely needed (e.g., to reflect a renamed module), they belong in a separate commit after the structural work is reviewed and confirmed safe.

A third failure mode is scope creep: the agent identifying "improvements" beyond the defined scope and including them in the refactoring diff. These extra changes are harder to review and introduce the risk of unintended behaviour changes. Redirect the agent explicitly when this happens: "do not change anything outside the scope I described." If the extra improvements are genuinely valuable, capture them as separate tasks and address them in separate workspaces.

At team scale, the workflow scales well because it produces auditable commits: the scope is defined upfront, the stages are separate, and the test suite serves as a verification record. Teams adopting this workflow should establish a shared standard for how refactoring commits are labelled in the commit message, so they're easy to identify in history and easy to filter when bisecting for a regression.

Performance implications are minimal — refactoring doesn't change runtime behaviour, so there's nothing to benchmark. The operational overhead is workspace management and commit hygiene. The maintenance burden is low if the commit discipline is maintained consistently. When the workflow breaks down and a regression is discovered after merge, the recovery path depends on whether the commit was kept separate: a standalone refactoring commit is clean to revert. A mixed commit is not. This is the strongest practical argument for the separation discipline.

## Next Steps

- [AI Feature Development Workflow](./ai-feature-development) — apply the same agent workspace model to new feature implementation
- [AI Bug Fix Workflow](./ai-bug-fix) — investigate structural problems revealed during a refactoring as candidate bugs worth fixing
- [Rust Refactoring Workflow](/learn/workflows/stacks/rust-refactoring) — apply these principles with Rust-specific tooling including Clippy and cargo fix
- [What is AI-Assisted Software Engineering?](/learn/concepts/ai-engineering/ai-assisted-software-engineering) — the broader context this workflow operates within
