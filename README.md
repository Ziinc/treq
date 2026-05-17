<div align="center">

![treq](./assets/combined-horizontal.png)

</div>

# treq

Treq is an open-source AI code review manager focused on parallel, agent-assisted development.

_Treq was used to build Treq._

![Code Overview](./assets/screenshots/code.png)

## Getting Started

Prerequisites:

- Git
- [Jujitsu](https://docs.jj-vcs.dev/latest/install-and-setup/) (no prior knowledge required)

Download the latest release [here](https://github.com/Ziinc/treq/releases).

## Features

### Code Reviews

Review diffs, leave comments, and send targeted change requests to agents.

![Code Review](./assets/screenshots/review.png)

- PR-style diff review with inline annotations and comments.
- Send file-level or commit-level feedback directly to agents.
- Built-in commit management for iterative review loops.

![Commit History](./assets/screenshots/commits.png)

### Workspaces

Agents work in isolated workspaces that stay synchronized:
- Automatic rebasing to keep branches fresh.
- Automatic conflict resolution by agents.
- Stackable workspaces for incremental, dependency-aware feature work.


## Developer

```bash
# to profile benchmark code
samply record cargo bench --bench sync_workspaces
```

## License

Licensed under the Apache License, Version 2.0
