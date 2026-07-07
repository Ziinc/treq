---
sidebar_position: 4
---

# AI Refactoring Workflow

A workflow for using a coding agent to refactor code safely — preserving behaviour while improving structure, readability, or performance.

## Overview

Refactoring is high-leverage work for AI agents. It's mechanical (rename, extract, move, restructure), broad (often touches many files), and requires no product judgement — just an understanding of the existing code and the target structure. The risk is that agents refactor beyond the intended scope or introduce subtle behaviour changes in the process.

The key discipline is keeping refactoring commits strictly separate from feature commits. Mixed diffs are hard to review and harder to revert if something breaks.

## Step 1 — Define the refactoring target clearly

Specify:

- **What to change**: "extract the authentication logic from `UserController` into a dedicated `AuthService`"
- **What not to change**: "don't alter the API signatures visible to callers outside this module"
- **Success criteria**: "all existing tests pass, no changes to public interfaces"

Avoid open-ended prompts like "clean up this file" — agents interpret these too broadly and produce diffs that are hard to reason about.

## Step 2 — Verify test coverage before starting

A refactoring is only safe if the existing tests cover the code being changed. Ask the agent to assess coverage before touching anything. If coverage is insufficient, have the agent write characterisation tests first — tests that document the current behaviour — then proceed with the refactor.

This is not optional. Merging a refactoring without a safety net is how subtle regressions reach production undetected.

## Step 3 — Break large refactorings into incremental steps

Large refactorings are best done in stages, each committed separately:

1. **Move without changing**: relocate a module or extract a class with no behavioural changes
2. **Update callers**: update all call sites to reference the new location
3. **Clean up**: remove dead code, update imports, rename for clarity

Reviewing three small diffs is easier than reviewing one large one, and each commit can be reverted independently if needed.

## Step 4 — Review for semantic equivalence

Reviewing a refactoring diff is different from reviewing a feature diff. The question isn't "does this do the right thing?" — it's "does this do exactly the same thing as before?"

Focus on:

- **Control flow**: are conditionals, loops, and error paths preserved exactly?
- **Side effects**: are all side effects (logging, metrics, cache invalidation) still triggered in the same order and under the same conditions?
- **Type widening/narrowing**: has the agent changed any type signatures in ways that could affect runtime behaviour?
- **Null and empty cases**: are edge cases handled the same way before and after?

## Step 5 — Run the full test suite

All tests must pass. Any failure is either a regression introduced by the refactoring or a gap in test coverage that the refactoring exposed. Investigate each failure before merging.

## Step 6 — Merge as a separate commit

Keep the refactoring commit separate from any feature work. This makes the change easy to identify in history and easy to revert if a post-deploy issue is traced back to the restructuring.

## Tips

- Tell the agent to make no changes to tests during the refactoring phase. Updated tests signal changed behaviour, which is what you're trying to avoid.
- For large codebases, scope the refactoring to a single module or package per workspace. Smaller scope means a smaller diff and lower risk.
- If the agent keeps proposing improvements beyond the defined scope, redirect it explicitly: "do not change anything outside the scope I described."

## Related workflows

- [AI Feature Development Workflow](./ai-feature-development)
- [AI Bug Fix Workflow](./ai-bug-fix)
- [Rust Refactoring Workflow](/learn/workflows/stacks/rust-refactoring)
