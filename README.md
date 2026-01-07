# Treq

Treq is your AI Code Review Manager, accelerating AI-assisted software development while maintaining high quality code. Treq is an open-source Graphite alternative with a focus on paralleized development using AI agents.

_Treq was used to build Treq._

## Features


### Code Reviews

Inspect and iterate on each change for a human-in-the-loop agentic workflow.

<!-- insert gif of a review -->

- Review the code diffs just like a familiar Github PR, annotate and comment on code, and then send it to an agent for changes.
- Spotted an issue when browsing files? Send it to an agent for adjustments in the background.

### Workspaces

Coding agents work in isolated copies of the codebase, ensuring changes are independent from each other while keeping your current repository clean for planning.

<!-- insert gif of worktree creation -->

- Workspaces are isolated but and automatically rebased, meaning code never goes stale.

- Got a code conflict? No problem! Let the agent handle it the grunt work.

#### Stacked Workspaces

Got a large feature but need to break it up for easier human review? Split developement into stacks, where features can be built incrementally over smaller branches and shipped in bite sized chunks.

<!-- insert gif of stacking -->

Workspaces can stack on top of each other, automatically rebasing as the underlying code changes.


## License

Licensed under the Apache License, Version 2.0
