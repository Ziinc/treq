---
sidebar_position: 5
---

# Rust Refactoring Workflow

A workflow for using AI agents to refactor Rust code safely — working with the borrow checker, maintaining API compatibility, and using the compiler as the primary verification tool.

## Overview

Rust refactoring is both harder and safer than refactoring in most other languages. Harder, because the borrow checker enforces ownership and lifetime rules that resist certain structural changes. Safer, because the compiler catches entire classes of bugs — use-after-free, data races, incorrect lifetimes — that would only appear at runtime in other languages.

AI agents can navigate Rust refactoring effectively when the scope is well-defined. The compiler provides immediate, precise feedback on each change, which makes the iteration cycle fast even for agents that need several passes to get a refactoring right.

## Step 1 — Identify what to refactor and why

Common Rust refactoring goals:

- **Reducing clone overhead**: replacing unnecessary `.clone()` calls with borrows or references
- **Improving error types**: replacing `String` errors or `unwrap()` with typed errors using `thiserror` or `anyhow`
- **Splitting large modules**: extracting types, traits, or implementations into separate files
- **Generic extraction**: making a concrete implementation work across types using generics or trait objects
- **Async migration**: converting sync blocking code to async, or migrating from one async runtime to another

Define the goal precisely. "Make this code better" will produce unfocused changes. "Replace all `unwrap()` calls in `src/db/` with proper error propagation using the existing `DbError` type" gives the agent a clear, verifiable target.

## Step 2 — Baseline with the compiler

Before making any changes, confirm the project compiles cleanly:

```bash
cargo check
cargo clippy
cargo test
```

Any pre-existing warnings or test failures should be documented before the refactoring begins. Otherwise, you can't distinguish new problems from existing ones after the agent runs.

## Step 3 — Scope the refactoring tightly

Tell the agent exactly which files or modules to touch. Rust changes propagate: modifying a type in one module often requires updating every caller. Agents sometimes fix these transitively, which is correct, but sometimes they add a new constraint to only some callers, leaving others in a broken state that won't compile.

For large refactorings, break the work into phases:

1. Change the type or trait definition
2. Update all call sites in one module at a time
3. Remove any dead code that the change made unreachable

Ask the agent to run `cargo check` after each phase and report errors before proceeding. Compiling incrementally catches problems at the right layer.

## Step 4 — Review for correctness beyond compilation

Rust's compiler proves a lot, but not everything. Review agent-generated code for:

- **Panic sites**: `unwrap()`, `expect()`, and `panic!()` the agent may have introduced — are they justified, or should they propagate errors?
- **Performance regressions**: the refactoring may have introduced extra allocations or copies that the borrow checker permits but are unnecessary
- **Unsafe blocks**: any `unsafe` the agent added requires scrutiny. Ask for justification and check that the safety invariant is documented
- **Trait object vs generics**: agents sometimes use `Box<dyn Trait>` where a generic parameter would be more efficient and idiomatic
- **Lifetime annotations**: correct but overly conservative lifetime bounds can restrict callers unnecessarily; review that bounds are as permissive as the code actually requires

## Step 5 — Verify with Clippy and tests

After the refactoring:

```bash
cargo clippy -- -D warnings
cargo test
```

Clippy warnings are not optional — they frequently catch the class of issues that compile but are wrong. Run with `-D warnings` to treat them as errors.

For public APIs, check that the refactoring hasn't inadvertently changed the public interface. `cargo doc` will reveal changes to documented items.

## Step 6 — Commit as a pure refactoring

Commit the refactoring separately from any feature work. The commit message should state what structural change was made and why, not the problem it fixed (that belongs in an issue).

## Working with agents on Rust

Rust-specific tips for agent work:

- **Provide the error output**: if `cargo check` or `cargo test` produces errors, paste the full output to the agent. Rust error messages are precise and the agent can act on them directly.
- **Ask for one pass, then iterate**: for complex lifetime or generic work, let the agent make one attempt, review the compiler output, then give the agent the errors to fix rather than trying to describe the fix yourself.
- **Clippy suggestions are safe to delegate**: `cargo clippy --fix` changes are mechanical and low-risk. Agents can apply clippy suggestions reliably.

## Related workflows

- [AI Refactoring Workflow](/learn/workflows/ai/ai-refactoring)
- [Tauri Development Workflow](./tauri-development)
- [AI Bug Fix Workflow](/learn/workflows/ai/ai-bug-fix)
