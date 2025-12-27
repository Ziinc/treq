# Treq - Coding Agent Orchestrator

Treq transforms AI-generated code into local isolated pull requests.

## What is Treq?

AI agents can create results fast, but they don’t organize anything. The output code on top of each other, overwriting previous work, and make it hard to see what changed or what should happen next.

**Treq fixes that by adding structure.**

Treq gives each agent result its own space, shows all changes clearly for review, and focuses on maximizing the engineer-in-the-loop development flow state.

Now, instead of a messy pile of AI output, you get a clean, organized workflow you can control.

## Features

### Code Reviews

Inspect and iterate on each change for a human-in-the-loop agentic workflow.


- Review the code diffs just like a familiar Github PR, annotate and comment on code, and then send it to an agent for changes.

<!-- insert gif of a review -->

- Spotted an issue when browsing files? Send it to an agent for adjustments in the background.

<!-- insert gif of file browser code comment flow -->

### Isolated Workspaces

Coding agents work in isolated copies of the codebase, ensuring changes are independent from each other while keeping your current repository clean for planning.

<!-- insert gif of worktree creation -->

- Workspaces are isolated but interlinked - move changes around workspaces, or split and stack workspaces as needed.

- All workspaces get automatically rebased against their targets, keeping code conflict sane and managable. And you can even delegate the conflict resolution to an agent!

## License

Licensed under the Apache License, Version 2.0
