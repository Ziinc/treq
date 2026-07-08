---
sidebar_position: 4
---

# Elixir AI Workflow

A workflow for AI-assisted development on Elixir and Phoenix applications — covering the patterns that work well with agents and the places where Elixir's concurrency model requires careful review.

## Introduction

Elixir and Phoenix have strong, well-documented conventions — contexts, Ecto schemas, changesets, OTP supervision trees, LiveView — that agents can learn and follow when given concrete examples from the project. This makes routine Phoenix feature work a good fit for AI assistance: agents generate schemas, context functions, controllers, and tests effectively when oriented to the codebase's patterns. The workflow is for backend engineers and full-stack teams building Phoenix applications who want to accelerate feature development without introducing N+1 query bugs, under-validated changesets, or concurrency errors that pass tests but break under real load. After reading this, you will be able to sequence agent work through Phoenix's layered architecture, apply an Elixir-specific review checklist, and know where the concurrency model requires human judgment rather than agent delegation.

## Understanding the Concept

Phoenix's architecture is layered by convention: Ecto schemas define data shapes, context modules contain business logic and database queries, and the interface layer — controllers, LiveView, or JSON API — calls into contexts. Agents navigate this structure effectively when they are shown an example of each layer and asked to follow it. The mental model for agent work in Elixir is: provide a reference module from each layer, describe the new feature in terms of the existing pattern, and ask the agent to follow that pattern strictly rather than inventing its own approach. "Follow the pattern in `lib/myapp/accounts.ex`" is more effective than describing the pattern abstractly, because it points the agent at real names, real function signatures, and real module structures.

Two Elixir primitives are especially important for agents to understand correctly. The first is the changeset, which is Elixir's primary validation mechanism. Agents that understand changesets produce correct validation logic; agents that conflate changesets with general data transformation produce code that looks plausible but skips validation. The second is `Ecto.Multi`, the tool for atomic multi-step database operations. Agents that do not know about `Ecto.Multi` generate sequential `Repo` calls that create partial-write failure modes when any step fails — the insert succeeds but the follow-on audit log does not, or vice versa.

Where Elixir creates the most friction for agents is in the OTP concurrency model. GenServers, Tasks, supervised processes, and message passing introduce timing and ordering dependencies that sequential unit tests do not exercise. An agent can generate a GenServer that handles simple requests correctly in isolation but has a race condition when two callers interact under load. Elixir's pattern matching also means that refactoring often touches many function clause heads — agents sometimes update some clauses and miss others, producing code that compiles but behaves incorrectly on certain inputs.

## Applying It in Practice

Begin every Phoenix feature task by orienting the agent with upfront context: whether the project uses LiveView, a JSON API, or both; which authentication library is in use (Pow, Guardian, or custom); and the testing approach (ExUnit with Mox for mocking, ExMachina for factories). Point the agent to one context module and one LiveView or controller that represent the project's conventions well. Also pin the Elixir and OTP versions — GenServer and supervisor APIs have changed across major versions, and the agent's training data includes multiple versions.

Sequence the work in this order. First, add the Ecto schema fields and generate the migration. Review the migration carefully before it runs — it is the hardest artefact to roll back, and agents sometimes generate migrations that drop columns or alter types rather than adding to them. The append-only rule is absolute: never modify a migration that has already run in any environment. If a migration needs correction, generate a new one that makes the corrective change.

Second, implement the context functions — the business logic, Ecto queries, and changesets. Review this layer for three categories of problem. N+1 queries: if the agent loads a list of records and then calls `Repo.get` or `Repo.preload` inside an enumeration, that is an N+1 that should be a single query with a join or preload. Changeset validation completeness: every field that has a database constraint should have a corresponding changeset validation that returns a user-readable error before the database is touched, not a cryptic Postgrex exception after. Transaction boundaries: any operation that writes to more than one table — insert a record, then create an audit log, then enqueue a notification — should use `Ecto.Multi` so that all steps succeed or none do.

Third, implement the controller or LiveView, then the tests. For LiveView tests, specify whether the feature uses live navigation (`push_navigate`, `push_patch`) or full-page loads — the agent needs this distinction to generate correct assertions. When writing factories, ExMachina's `build` should be used in unit tests and `insert` only in integration tests; agents often use `insert` everywhere, which makes the test suite slow as it accumulates unnecessary database writes.

For OTP code — GenServers, Tasks, Supervisors — ask the agent to explain its approach before writing code. Review `init/1` to confirm it handles slow or failing initialisation appropriately (consider `{:ok, state, {:continue, :init}}` for work that should not block supervision tree startup). Review every `handle_call` and `handle_cast` clause to confirm state transitions are correct and return values match what callers expect. Review the restart strategy against the process's purpose: `:permanent` for infrastructure processes that must always run, `:transient` for work processes that may fail legitimately, `:temporary` for fire-and-forget tasks.

## Engineering Decision Guide

AI assistance adds the most value in Phoenix for high-volume, pattern-following work: schema generation, context function scaffolding, controller or LiveView boilerplate, and test fixtures. Phoenix features follow a predictable structure, and agents oriented to the project's patterns produce correct scaffolding reliably. Refactoring tasks are also well-suited — extracting a large context into focused sub-contexts, converting raw Ecto queries in controllers to proper context functions, adding telemetry events to existing operations. Elixir's pattern matching makes these transformations clear-cut when the scope is defined precisely, and the test suite catches regressions if it was written against behaviour rather than implementation.

The trade-offs concentrate in concurrency and data integrity. A GenServer that works correctly in unit tests can fail intermittently in production because of a race condition between two simultaneous callers — a failure mode that is invisible in sequential test suites. A context function that omits a changeset validation allows invalid data through to the database, producing constraint errors in production that look like infrastructure failures rather than application bugs. Neither failure mode is obvious in code review.

AI assistance adds specific risk for OTP design: defining supervision hierarchies, writing GenServer state machine transitions, and reasoning about message ordering under concurrent load. Agents produce plausible-looking OTP code that may be semantically incorrect in ways that only surface under concurrency. For any new supervised process or GenServer that carries meaningful state, design the approach yourself and delegate only the implementation of each well-defined step.

## Scaling & Operational Considerations

N+1 queries are the most common failure mode that accumulates in AI-generated Phoenix code. Agents generate context functions that work correctly for single records and silently load N+1 when called from a list endpoint that grows over time. Adding a tool like `ex_check` or the `Ecto.Sandbox` with query counting in tests catches query count regressions before they reach production. Changeset validation gaps are the next most common: a database NOT NULL constraint or unique index with no corresponding changeset validation surfaces as a cryptic Postgrex error to the user rather than a readable validation message.

GenServer state corruption is the hardest failure mode to diagnose. An incorrect `handle_call` implementation may return the right response but update internal state incorrectly, causing downstream calls to fail in ways that are difficult to trace back to the original cause. For critical GenServers, write property-based tests using StreamData or PropCheck that exercise many state transition sequences, not just the happy path that unit tests cover.

OTP supervision hierarchies require careful human review. Agents often default to `:permanent` restart strategies for all processes, which causes a supervisor to keep restarting a process when the failure is permanent — a bad configuration value, a missing external dependency. A supervisor that restarts such a process in a tight loop can destabilise the entire application. Review restart strategies against the process's purpose and set the maximum restart intensity appropriately.

Security in Phoenix is primarily about authorization at the context layer. Agents may generate context functions that query or modify records without checking whether the calling user owns the record or has permission to access it. Review every context function for a `where: record.user_id == ^user_id` clause or equivalent scoping. Do not rely on the controller or LiveView layer to enforce row-level access control — by the time the interface layer runs, the query has already executed.

## Next Steps

- [AI Feature Development Workflow](/learn/workflows/ai/ai-feature-development) — the general framework for structuring end-to-end feature tasks with an AI agent
- [AI Bug Fix Workflow](/learn/workflows/ai/ai-bug-fix) — how to give agents the right context to diagnose and fix bugs, including concurrency bugs that only appear under load
- [Human-in-the-Loop Review Workflow](/learn/workflows/git/human-in-the-loop-review) — the review process for AI-generated code, covering how to structure checkpoints for high-risk changes like database migrations and OTP supervision changes
