---
sidebar_position: 1
slug: /
---

# Welcome to Treq

Treq is your AI Code Review Manager, accelerating AI-assisted software development while maintaining high quality code. An open-source alternative to Graphite, Treq focuses on parallelized development workflows powered by AI agents.

---

## What is Treq?

AI agents can generate code incredibly fast, but they need human oversight to maintain quality. Without structure, AI-generated changes pile up, overwrite each other, and make it difficult to review what actually changed.

**Treq solves this by adding workspace-based organization and review workflows.**

Instead of letting AI agents work directly in your main codebase, Treq creates isolated workspaces for each task. You can review each change thoroughly, provide feedback through inline comments, and merge only what meets your standards. For larger features, stack workspaces on top of each other to break development into reviewable increments.

The result: you get the speed of AI-assisted development with the quality control of human review.

## Key Features

### Code Reviews

Review AI-generated changes with a familiar GitHub PR-like interface. Treq provides a dedicated review environment where you can examine diffs, add inline comments on any line or range, and categorize feedback (issues, suggestions, questions, praise). Comments support markdown and threading for detailed discussions.

Once you've reviewed the code, you can request changes and send feedback directly to an AI agent for adjustments, or approve the changes for merging. Export your review as markdown to share with your team or paste into external pull requests.

**Learn more:** [Code Review Documentation](/docs/features/code-review)

### Workspaces

Workspaces give each AI agent an isolated copy of your codebase to work in, powered by Git worktrees. Changes in one workspace never interfere with another, and your main repository stays clean for planning and coordination. This enables true parallel development—run multiple agents on different features simultaneously without conflicts.

Workspaces are automatically rebased to stay up-to-date with the main branch. When conflicts occur, you can let an AI agent handle the resolution work for you. Each workspace maintains its own terminal sessions, build outputs, and development servers, making it easy to test changes independently.

**Learn more:** [Worktrees Documentation](/docs/features/worktrees)

### Stacked Workspaces

For larger features that need to be broken down for easier review, Treq supports stacked workspaces—similar to Graphite's stacking workflow. Create a series of workspaces where each builds on the previous one, letting you develop and ship features incrementally in bite-sized, reviewable chunks.

When you update an underlying workspace, Treq automatically rebases the entire stack to keep everything in sync. This makes it practical to split big features into logical steps that can be reviewed and merged independently, accelerating both development and review cycles.

**Learn more:** [Worktrees Documentation](/docs/features/worktrees)

## Open-Sourced

Treq is open-source and licensed under the Apache License, Version 2.0
