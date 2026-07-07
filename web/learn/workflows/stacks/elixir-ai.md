---
sidebar_position: 4
---

# Elixir AI Workflow

A workflow for AI-assisted development on Elixir and Phoenix applications — covering the patterns that work well with agents and the places where Elixir's concurrency model requires careful review.

## Overview

Elixir has strong conventions — Phoenix contexts, Ecto schemas and changesets, OTP supervision trees — that agents can learn and follow from examples. When given a clear reference to existing patterns, agents produce idiomatic Elixir effectively. The risks are in concurrency: GenServer state, process supervision, and message passing require more careful review than sequential code because bugs may only manifest under load or timing conditions that tests don't exercise.

## Orienting agents to an Elixir project

Provide upfront context:

- **Phoenix or plain Elixir**: Phoenix projects have conventions (contexts, controllers, LiveView) that differ from plain OTP applications
- **Database**: Ecto with Postgres is standard, but the schema and migration conventions vary
- **Authentication library**: Pow, Guardian, or custom? Agents should extend the existing approach, not introduce a second one
- **Testing approach**: ExUnit with Mox for mocking? Factory libraries (ExMachina)? Agents need to follow the project's testing conventions

Point the agent to one or two modules that represent the project's conventions well. "Follow the pattern in `lib/myapp/accounts/user.ex`" is more effective than describing the pattern abstractly.

## Phoenix feature development

For a typical Phoenix feature (context function + controller + LiveView or JSON API):

1. **Schema and migration first**: have the agent add the Ecto schema fields and generate the migration. Review the migration carefully — it's the hardest change to roll back.
2. **Context functions**: the business logic in the context module, with Ecto queries and changesets
3. **Controller or LiveView**: the interface layer that calls the context
4. **Tests**: ExUnit tests for each layer

Review the context layer carefully for:

- **N+1 queries**: `Repo.preload` at the right level, or explicit joins in the query
- **Changeset validation**: is all required validation present? Does the changeset return useful error messages?
- **Transaction boundaries**: multi-step operations (insert + send email + log audit event) should be wrapped in `Ecto.Multi` to keep them atomic

## OTP and concurrency patterns

Agents can generate GenServers, Tasks, and supervision trees, but these require more careful review than Phoenix CRUD code:

**GenServer state**: review that state transitions are correct, that handle_call and handle_cast match what callers expect, and that `init/1` handles slow or failing initialisation appropriately (consider `{:ok, state, {:continue, :init}}` for work that shouldn't block supervision tree startup).

**Process supervision**: is the new process under the right supervisor? Is the restart strategy (`:permanent`, `:transient`, `:temporary`) correct for the process's purpose?

**Message passing**: agents sometimes generate race conditions — a caller that sends a message and assumes a response arrives before some other event. Review message-passing code for implicit ordering assumptions.

For complex concurrency work, ask the agent to explain its approach before writing code. An incorrect understanding of the problem will produce subtly broken code that passes tests under normal conditions.

## Refactoring Elixir code

Elixir refactoring tasks well-suited to agents:

- Extracting a large context module into smaller, more focused contexts
- Converting raw Ecto queries in controllers to proper context functions
- Migrating from a deprecated library version to a current one
- Adding telemetry events to existing operations

Elixir's pattern matching means that refactoring often touches many clause heads. Ask the agent to list all the clauses it's modifying before making changes, so you can verify none are missed.

## Testing with Mox and ExMachina

For new code:

- Ask the agent to define Mox behaviours before using them in tests, if they don't already exist
- Factory functions in ExMachina should use `build` for unit tests and `insert` for integration tests — agents sometimes use `insert` everywhere, which slows test suites
- LiveView tests should use `live/2` from `Phoenix.LiveViewTest` and assert on rendered content, not internal state

## Tips

- For LiveView work, specify whether the feature uses live navigation (`push_navigate`, `push_patch`) or full-page loads. The agent needs to know this to generate correct test assertions.
- Ecto migrations are append-only in production. Ask the agent to generate new migrations rather than modifying existing ones, even for small corrections.
- Pin the Elixir and OTP versions in the context. GenServer and supervisor APIs have changed across major versions; the agent's training data includes multiple versions.

## Related workflows

- [AI Feature Development Workflow](/learn/workflows/ai/ai-feature-development)
- [AI Bug Fix Workflow](/learn/workflows/ai/ai-bug-fix)
- [Human-in-the-Loop Review Workflow](/learn/workflows/git/human-in-the-loop-review)
