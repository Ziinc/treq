---
sidebar_position: 3
---

# Tauri Development Workflow

A workflow for AI-assisted development on Tauri applications — covering the Rust backend, TypeScript frontend, and the IPC boundary that connects them.

## Overview

Tauri apps have a split architecture: a Rust backend handling system interactions, and a web frontend (typically React or Vue) handling the UI. AI agents can work effectively in both layers, but the IPC boundary is where errors tend to accumulate. Changes to a Tauri command signature on the Rust side must be matched by changes to the `invoke` call on the frontend side, and the compiler won't catch mismatches across the language boundary.

This workflow covers how to sequence AI work across both layers and where to review most carefully.

## Orienting agents to a Tauri project

Give agents a brief architecture overview before each task:

- **Frontend framework**: React, Svelte, Vue? Which component library?
- **State management**: Zustand, Jotai, or other?
- **Tauri version**: Tauri v1 and v2 have different plugin APIs, permission models, and command invocation patterns
- **Existing command patterns**: point to one or two existing commands as examples for the agent to follow

Tauri v2 introduced breaking changes to the plugin system and capability configuration. Always confirm which version the project targets before the agent touches capability files or plugin registrations.

## Developing new Tauri commands

The natural sequence for a new command:

1. **Define the Rust command function** in the appropriate handler module, using the existing patterns for error types, serialisation, and state access
2. **Register the command** in the Tauri builder in `main.rs` or `lib.rs`
3. **Add the capability** if the command requires file system, network, or other privileged access
4. **Write the frontend invoke call** with the matching argument types and handle the `Result` appropriately
5. **Add a TypeScript type or wrapper function** that makes the command ergonomic to use from components

Ask the agent to implement these in order and stop for review after the Rust side is complete before proceeding to the frontend. The Rust compiler will catch errors in the backend; the frontend type checking won't catch a mismatched argument name.

## Reviewing Tauri command implementations

When reviewing agent-generated Tauri commands, check:

- **Error handling**: does the command return a typed error rather than panicking? Panics in a Tauri command crash the app process.
- **State access**: if the command accesses `State<T>`, is the state type correct and correctly registered?
- **Serialisation**: complex return types must derive or implement `serde::Serialize`. Missing derives produce unhelpful runtime errors.
- **Blocking operations**: long-running operations should use `spawn_blocking` or Tokio async rather than blocking the Tauri command thread.
- **Capability scope**: is the capability declaration as narrow as possible? Overly broad capabilities expose unnecessary access.

On the frontend:

- **Invoke types**: do the argument types in the `invoke` call match the Rust function signature exactly?
- **Error handling**: is the rejected case of the `invoke` Promise handled, not just the resolved case?
- **Loading state**: does the UI reflect the async nature of the call?

## Rust backend tasks

For pure Rust backend work (database access, file operations, background tasks), the Rust-specific refactoring workflow applies. The main Tauri-specific considerations:

- **Tauri plugins** have their own API surface — check the plugin documentation for the specific Tauri version before asking an agent to use one
- **Background tasks** that outlive a command invocation should use Tauri's managed state to communicate results back to the frontend via events

## Frontend tasks

The React or Svelte frontend of a Tauri app follows the same workflow as a standalone frontend application. The main difference is that data fetching goes through `invoke` rather than HTTP calls. Agents should use the project's existing invoke wrapper pattern rather than calling `@tauri-apps/api/core` directly in components.

## Tips

- Keep the IPC surface small. Every new Tauri command is a cross-language contract that agents can misspecify. Prefer batching related data into fewer commands over one command per field.
- Run `cargo check` after agent changes to the Rust side before running the full app. It catches type errors in seconds rather than requiring a full rebuild.
- For capability files, review agent output against the Tauri documentation rather than trusting that the agent's generated JSON is correct — capability format details change between versions.

## Related workflows

- [Rust Refactoring Workflow](./rust-refactoring)
- [React Development Workflow](./react-development)
- [AI Feature Development Workflow](/learn/workflows/ai/ai-feature-development)
