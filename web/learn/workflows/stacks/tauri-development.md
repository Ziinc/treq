---
sidebar_position: 3
---

# Tauri Development Workflow

A workflow for AI-assisted development on Tauri applications — covering the Rust backend, TypeScript frontend, and the IPC boundary that connects them.

## Introduction

Tauri applications split their logic across two runtimes: a Rust process handling system interactions and a web frontend — typically React or Vue — handling the UI. AI agents can work in both layers, but the point where they most often introduce subtle, hard-to-catch errors is the IPC boundary. A Rust command signature must match the TypeScript `invoke` call exactly, and neither the Rust compiler nor the TypeScript type checker can verify the contract across the language divide. A function named `get_file_list` on the Rust side and invoked as `getFileList` on the TypeScript side produces a runtime error, not a compile error — the mismatch is invisible until the code path executes.

This workflow is for engineers building Tauri v2 applications who want to use AI agents effectively without accumulating IPC mismatches, unhandled panics, or overly permissive capability declarations. After reading it, you will be able to sequence agent work across the Rust and TypeScript layers, run a structured review of generated commands, and know which details agents most commonly get wrong in Tauri projects.

## Understanding the Concept

The mental model for AI-assisted Tauri development is that you are managing two separate agent tasks that must be stitched together at the IPC boundary. Within each layer, agents are effective: Rust agents produce idiomatic command handlers when given an existing command as a reference; TypeScript agents produce correct `invoke` wrappers when told the argument types and return shape. The gap is between layers, where an agent asked to implement an entire feature end-to-end may generate plausible-looking code in both layers with a silent mismatch in argument names, argument types, or the command identifier string.

Tauri v2 made significant breaking changes relative to v1: the plugin system was restructured, capability declarations moved to a new JSON format, and the `invoke` pattern changed for some command types. Agents whose training data includes Tauri v1 examples may generate v1-style permission scopes, plugin registrations, or event listener APIs that do not work in v2 projects. This version confusion is the most common category of AI mistake in Tauri codebases, and it is difficult to spot in review without knowing the v2 API specifically. Explicitly confirming the Tauri version in the task prompt is not optional.

The Rust side of Tauri has a structural advantage for agent work: the compiler provides precise, actionable feedback on every change. A command with an incorrect return type produces a compiler error immediately. The TypeScript side produces no error until the app is running and the specific command is invoked. This asymmetry means that sequencing work Rust-first and running `cargo check` before writing any TypeScript captures backend errors at the fastest feedback point and prevents writing TypeScript against a broken Rust signature.

## Applying It in Practice

Start every Tauri task by giving the agent an architecture overview: which frontend framework and component library the project uses, which state manager handles global data, the Tauri version (always state this explicitly — the word "Tauri" alone is ambiguous), and one or two existing command implementations to use as reference patterns. Point the agent to the project's existing error type so it returns consistent errors rather than inventing a new one.

Implement new commands in this sequence. First, define the Rust command function in the appropriate handler module, following the existing patterns for error types and state access:

```rust
#[tauri::command]
pub async fn get_recent_files(
    state: tauri::State<'_, AppState>,
    limit: usize,
) -> Result<Vec<FileEntry>, AppError> {
    state.db.get_recent_files(limit).await.map_err(AppError::from)
}
```

Second, register the command in the Tauri builder in `main.rs` or `lib.rs`, then run `cargo check` and resolve any type errors before writing a single line of TypeScript. Third, add the capability declaration if the command requires privileged access — keep it as narrow as possible, naming a specific path scope rather than `fs:allow-read-all`. Fourth, write the TypeScript invoke call with argument names and types matching the Rust signature exactly, and wrap it in a typed function rather than calling `@tauri-apps/api/core` directly from components:

```typescript
export async function getRecentFiles(limit: number): Promise<FileEntry[]> {
  return invoke<FileEntry[]>('get_recent_files', { limit });
}
```

When reviewing agent-generated commands, check every panic site first: `unwrap()`, `expect()`, or `panic!()` in a Tauri command crashes the app process, not just the command handler, so any unhandled error terminates the application. Check that complex return types derive `serde::Serialize` — missing derives produce cryptic runtime errors rather than compile errors. Check that long-running operations use `spawn_blocking` or are already async rather than blocking the command thread. On the TypeScript side, verify that the invoke call handles the rejected case of the returned Promise, not only the resolved case, and that the UI reflects the async nature of the call with a loading state.

## Engineering Considerations

AI assistance adds significant value in Tauri for command boilerplate: handler signatures, state access patterns, serialization derives, and error mapping are mechanical and consistent once the agent has a reference command. The same applies to the TypeScript side — invoke wrappers, loading state management, and error display in the UI are repetitive work that agents handle well when the types are specified clearly. Agents also reduce the friction of generating capability declarations for standard operations like file dialog access or clipboard writes.

The primary risk is IPC contract drift. An agent asked to change a command's return type will update the Rust function but may not update every TypeScript call site, particularly if they are spread across multiple components. This produces runtime errors that are invisible until the specific code path executes. A secondary risk is in capability declarations: agents tend toward permissive scopes — file system access to all paths rather than a specific directory, network access to all hosts rather than named endpoints — because they are optimising for "works" rather than "appropriately scoped."

Panics in Rust commands are higher-severity than panics in most other Rust contexts because they crash the entire app process rather than returning an error to a single caller. AI-generated Rust that compiles and passes initial manual testing may still contain panic sites that only trigger on edge-case inputs or under error conditions. The compiles-but-panics pattern is the most important thing to hunt for in Tauri command review.

## Scaling & Operational Considerations

The failure mode that accumulates most in AI-generated Tauri code is IPC signature drift: the Rust side and the TypeScript side of a command evolve separately as a feature grows, and the mismatch only surfaces at runtime. The most effective structural mitigation is to generate TypeScript type definitions from Rust types using `ts-rs`, which derives TypeScript interfaces directly from Rust structs and makes mismatches a compile-time error. If your project does not use `ts-rs`, establish a convention of keeping Rust command signatures and TypeScript wrappers in adjacent files and reviewing them together in every PR.

Version confusion between Tauri v1 and v2 is a specific, recurring mistake that requires active review rather than trust. When examining agent-generated capability files or plugin registrations, compare the output against the Tauri v2 documentation directly. The capability JSON format, the plugin identifier scheme, and the window permission model all changed in v2. An agent that generates syntactically valid JSON for the wrong version will produce a configuration that silently fails or grants unintended permissions.

Security in Tauri is primarily about capability scope. Every capability the agent declares should be the minimum required for the feature — a specific directory path rather than all paths, a specific URL origin rather than all network access. Treat any `allow-all` scope as a red flag requiring explicit written justification in the PR. Audit capability files the same way you audit `sudo` rules: broad grants that were added for convenience tend to remain permanently.

Long-term maintenance of AI-generated Tauri code benefits from keeping the IPC surface small. Agents often propose one command per data field when the right design is one command per logical operation. Fewer commands mean fewer cross-language contracts to keep in sync, fewer capability declarations to audit, and a simpler surface for future agents and engineers to reason about.

## Next Steps

- [Rust Refactoring Workflow](./rust-refactoring) — how to refactor the Rust backend layer safely using the compiler as the verification tool
- [React Development Workflow](./react-development) — the companion workflow for the TypeScript/React frontend layer of a Tauri application
- [AI Feature Development Workflow](/learn/workflows/ai/ai-feature-development) — the general framework for structuring end-to-end feature work with an AI agent
- [What are Coding Agents?](/learn/concepts/ai-engineering/coding-agents) — foundational concepts for understanding how AI coding agents work and where they fit in a development workflow
