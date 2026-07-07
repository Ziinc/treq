---
sidebar_position: 5
---

# What is Agent Orchestration?

Agent orchestration is the coordination of multiple AI agents across tasks — routing work to agents, managing dependencies between their outputs, handling failures, and aggregating results — so that complex goals can be parallelised and completed reliably.

## Why orchestration is needed

A single coding agent working sequentially on one task is straightforward to manage. But as teams adopt AI more broadly, they face problems a single agent can't handle well:

- **Scale**: dozens of tasks queued simultaneously that one agent working sequentially would take hours to complete
- **Specialisation**: different tasks suit different models or agent configurations (a fast cheap model for formatting; a more capable model for complex refactoring)
- **Dependencies**: task B can only start after task A produces output
- **Isolation**: parallel agents must not overwrite each other's changes
- **Failures**: an agent that gets stuck or produces bad output shouldn't block unrelated work

Orchestration is the layer that solves these problems.

## Orchestration patterns

**Sequential chain**: each agent's output feeds into the next. Common for pipelines like: spec → implementation → test generation → review.

**Parallel fan-out**: multiple agents work simultaneously on independent tasks. Common when a feature can be split into non-overlapping components.

**Hierarchical / supervisor model**: a planning agent breaks a large task into subtasks, dispatches them to worker agents, and assembles the results.

**Event-driven**: agents are triggered by external events — a CI failure, a new pull request, a webhook — rather than a human queuing tasks manually.

## Workspace isolation in orchestration

A central requirement for parallel agents is that each agent works in its own isolated environment. Without isolation, two agents modifying the same files will produce conflicts that are expensive to resolve.

Git worktrees, separate clones, or sandbox environments serve this role. Each agent gets its own working directory; completed work is proposed as a reviewable change before it's merged.

## The human role in orchestrated systems

As agent output scales, human review becomes the bottleneck. Effective orchestration systems therefore:

- Batch related changes for review together rather than flooding reviewers with individual PRs
- Prioritise work for human attention based on risk or complexity
- Provide reviewers with enough context to evaluate agent output quickly

The goal is to match the throughput of the agent layer to the throughput of human review, rather than accumulating a backlog of unreviewed AI-generated changes.

## Related concepts

- [What are Coding Agents?](./coding-agents)
- [What is Human-in-the-Loop Development?](./human-in-the-loop-development)
- [What is AI-Assisted Software Engineering?](./ai-assisted-software-engineering)
