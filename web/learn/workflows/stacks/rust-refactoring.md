---
sidebar_position: 5
---

# Rust Refactoring Workflow

A workflow for using AI agents to refactor Rust code safely — working with the borrow checker, maintaining API compatibility, and using the compiler as the primary verification tool.

## Introduction

Rust refactoring with AI agents is distinct from refactoring in most other languages because the compiler provides precise, actionable feedback on every change. An agent can propose a structural change, run `cargo check`, receive exact error messages, and fix each error in sequence — a tight feedback loop that makes even complex refactors tractable without the human needing to guide each step. This workflow is for Rust engineers who want to use AI agents to reduce clone overhead, improve error types, split large modules, or migrate async runtimes, without introducing panic sites, unsafe invariants, or overly conservative lifetime bounds in the process. After reading it, you will be able to baseline a project correctly before touching anything, scope refactorings in a way that keeps the agent focused, and apply a review pass that catches what the compiler cannot.

## Understanding the Concept

The mental model for AI-assisted Rust development is: the agent proposes, the compiler verifies, and you review the gap between "compiles" and "correct." The borrow checker proves the absence of use-after-free, data races, and incorrect lifetimes — a significant guarantee that eliminates entire categories of review. What it does not prove is performance (a refactoring may introduce extra allocations that the compiler permits without complaint), semantic correctness (a function may have the right type signature but wrong behaviour), or safety invariant preservation (an `unsafe` block may be syntactically valid but violate the conditions under which it is safe to use).

Rust's type system helps agents work accurately. Type definitions are explicit and precise, trait bounds are visible in function signatures, and the module system makes scope unambiguous. Agents reading a well-structured Rust codebase have accurate information about what each function accepts and returns. This is why providing the full output of `cargo check` or `cargo test` directly to the agent is so effective — the error messages name the exact type expected, the exact type received, and the source location of the mismatch, giving the agent everything it needs to fix the error without asking follow-up questions.

Where agents struggle in Rust is in lifetime and generic reasoning. Agents can generate lifetime annotations that are correct — the code compiles — but that are more restrictive than the code actually requires, preventing callers from using the function in valid ways that will only be attempted later. Agents also sometimes reach for `Box<dyn Trait>` where a generic parameter would be more efficient and idiomatic, or introduce `Arc<Mutex<T>>` where the ownership structure does not require shared access. These are compiles-but-suboptimal patterns that the borrow checker does not flag and that Clippy catches only partially.

## Applying It in Practice

Before asking an agent to touch anything, establish a clean baseline:

```bash
cargo check
cargo clippy -- -D warnings
cargo test
```

Document any pre-existing warnings or failing tests. Without a baseline, you cannot distinguish problems the agent introduced from problems that already existed. This step takes two minutes and prevents hours of confusion after the refactoring runs.

Scope the refactoring tightly when writing the task prompt. Rust changes propagate through callers: modifying a type in one module often requires updating every function that uses it. Agents sometimes fix these transitively — which is correct — but sometimes add a new constraint to only some callers, leaving others in a broken state that will not compile. Define the exact files or modules the agent should touch. For large refactorings, break the work into phases and ask the agent to run `cargo check` after each phase before proceeding: change the type or trait definition first, update all call sites in one module at a time second, and remove dead code that the change made unreachable third.

For a concrete example: replacing `unwrap()` calls in a database module with proper error propagation using an existing `DbError` type. The prompt names the specific directory (`src/db/`), names the target error type (`DbError`), and specifies that the agent should not touch files outside that directory in the first pass. The agent converts each `unwrap()` to a `?` or a `.map_err(DbError::from)`, and `cargo check` confirms that the error type propagates correctly through callers. Passing compiler output back to the agent on failure is faster than describing the problem yourself.

When reviewing agent-generated Rust code, check in this order. First, panic sites — any `unwrap()`, `expect()`, or `panic!()` the agent introduced. Are they justified by an invariant that genuinely cannot be violated at that point, or should they propagate an error? Second, `unsafe` blocks — any `unsafe` the agent added requires a safety comment documenting the specific invariant that makes the code valid:

```rust
// SAFETY: ptr is non-null (checked above) and properly aligned by
// construction; no other reference to this memory exists at this point.
unsafe { ptr.as_ref() }
```

Third, lifetime annotations — are they as permissive as the code actually requires, or has the agent added bounds that restrict callers unnecessarily? Fourth, performance — has the refactoring introduced extra `.clone()` calls or heap allocations that the original did not have, and can they be eliminated with a borrow or a reference? After reviewing, run the final verification gate:

```bash
cargo clippy -- -D warnings
cargo test
```

Clippy catches a significant class of issues that compile but are wrong: unnecessary clones, incorrect iterator usage, patterns that are legal but that idiomatic Rust avoids. Treating Clippy warnings as errors in CI converts these from a review burden into an automatic gate.

## Engineering Considerations

AI assistance adds the most value in Rust for mechanical refactoring tasks: replacing `unwrap()` with error propagation across many call sites, applying `cargo clippy --fix` suggestions systematically, splitting a large module into smaller files, renaming a type and updating all references. These tasks are time-consuming in large codebases, the compiler provides immediate verification of each change, and the risk of an agent introducing a subtle bug is low when the change is purely structural. Clippy suggestions are particularly safe to delegate — `cargo clippy --fix` changes are mechanical and the agent can apply them reliably.

The primary risk is in changes that compile but are not correct. A refactoring that introduces extra `.clone()` calls compiles and passes tests but degrades performance in hot paths. A lifetime annotation that is too restrictive compiles in the test suite but rejects valid caller patterns that appear later. An `unsafe` block added to sidestep a legitimate ownership problem may violate an invariant that holds in the test environment but not under production inputs. Generated Rust that compiles is not the same as generated Rust that is correct.

AI assistance adds risk for architectural changes to ownership and concurrency structures: introducing a new `Arc<Mutex<T>>`, redesigning the error hierarchy across a library boundary, or restructuring the async task graph. These decisions have downstream implications that propagate through the codebase in ways that require understanding the design intent, not just the type constraints. For these tasks, design the approach yourself and delegate only the implementation of each well-defined phase.

## Scaling & Operational Considerations

The failure mode that accumulates most in AI-generated Rust code is the unwanted `unwrap()`. Agents introduce panic sites in two situations: when they are resolving a type error quickly and `unwrap()` is the path of least resistance, and when they are generating new code and assume a value is always present. A `clippy.toml` that enables `clippy::unwrap_used` and `clippy::expect_used` as warnings in library code converts accumulated panics from a review burden into a hard CI gate. In binary crates, consider enabling these lints at least for non-main modules.

Unsafe blocks without safety documentation are the highest-severity long-term maintenance problem. A future engineer modifying code around an undocumented `unsafe` block has no way to know what invariant the unsafe relies on, making it likely that a refactoring silently breaks that invariant. Require safety comments on all `unsafe` blocks as a code review gate — not as documentation that gets written later, but as a condition of merging. AI-generated `unsafe` code should be treated with extra scrutiny: agents generate syntactically valid unsafe code that can violate pointer aliasing rules, uninitialized read rules, or `transmute` requirements in ways that only surface under specific runtime conditions.

Lifetime bounds that are too conservative are a subtler long-term cost. They compile and pass tests, but they constrain how the function can be called — leading future engineers to insert unnecessary `.clone()` calls as workarounds, or to copy the function rather than calling the original. When reviewing lifetime annotations, ask whether the bound could be loosened without changing behaviour; often an `'a: 'b` constraint can be replaced with a simpler relationship or removed entirely.

Security considerations in Rust concentrate almost entirely on `unsafe` code. Safe Rust is memory-safe by construction; the risk is in `unsafe` blocks that bypass the borrow checker. Beyond safety comments, run `cargo audit` in CI to catch known-vulnerable crate versions, and treat any agent-introduced dependency as a new surface to review.

## Next Steps

- [AI Refactoring Workflow](/learn/workflows/ai/ai-refactoring) — the general framework for structuring refactoring tasks with an AI agent, including how to define scope and checkpoint progress
- [Tauri Development Workflow](./tauri-development) — applying Rust agent work in the context of a Tauri desktop application where the Rust layer connects to a TypeScript frontend via IPC
- [AI Bug Fix Workflow](/learn/workflows/ai/ai-bug-fix) — how to give agents the context needed to diagnose and fix bugs in Rust, including using full compiler and test output as diagnostic input
