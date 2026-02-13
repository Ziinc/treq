---
sidebar_position: 1
slug: /
---

# Treq

Treq is your AI Code Review Manager, an open-source alternative to Graphite, Treq focuses on parallelized human-in-the-loop AI development workflows.

Features:

- Isolated workspaces with stacking
- Automatic rebasing with AI conflict resolution

### Stacked Workspaces

For larger features that need to be broken down for easier review, Treq supports stacked workspaces—similar to Graphite's stacking workflow. Create a series of workspaces where each builds on the previous one, letting you develop and ship features incrementally in bite-sized, reviewable chunks.

When you update an underlying workspace, Treq automatically rebases the entire stack to keep everything in sync. This makes it practical to split big features into logical steps that can be reviewed and merged independently, accelerating both development and review cycles.

## Open-Sourced

Licensed under the Apache License, Version 2.0
