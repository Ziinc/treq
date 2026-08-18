<div align="center">

![treq](./assets/combined-horizontal.png)

</div>

# treq

Treq is the open-source Stacking Agent Development Environment (ADE). It gives each agent its own workspace, stacks branches, and rebases when the base moves.

![Treq code overview](./assets/screenshots/code.png)

## Getting Started

Download the latest release [here](https://github.com/Ziinc/treq/releases). Install steps are in the [installation docs](https://treq.dev/docs/getting-started/installation).

## Features

- Works with Claude Code, Codex, and Cursor Agent. [Agent sessions](https://treq.dev/docs/concepts/agent-sessions) lists Plan and Edit modes per agent.
- Review the diff on your machine. Workspace tabs are Code, Commits, and Changes. Send line comments to a local agent as Plan or Edit. See [Changes and reviews](https://treq.dev/docs/concepts/changes-and-reviews) and the [code review workflow](https://treq.dev/docs/tutorials/code-review-workflow).
- Read the whole change, or one commit, on the same screen. File navigation, the diff, and inline comments stay together. When a workspace has an open GitHub pull request, Changes can also show GitHub review threads. Quoting a thread does not reply on GitHub. See [GitHub review threads](https://treq.dev/docs/concepts/changes-and-reviews#github-review-threads) and [commit-level diffs](https://treq.dev/docs/concepts/commit-management#commit-level-diff).
- Isolated [workspaces](https://treq.dev/docs/concepts/workspaces). Each agent gets its own checkout. An uncommitted change in one workspace never shows up in another. Tutorial: [managing workspaces](https://treq.dev/docs/tutorials/managing-workspaces).
- Auto-rebase. When the target branch moves, Treq rebases dependent workspaces. You still push and pull with Git. You never have to learn Jujutsu. See [workspaces](https://treq.dev/docs/concepts/workspaces).
- Split a feature into a stack. Stack creates a workspace that targets another workspace. When you land the base, Treq rebases the rest. Merge locally with familiar and stack-native strategies. Tutorial: [merging workspaces](https://treq.dev/docs/tutorials/merging-workspaces).
- Agents start more agents. Tell one agent to split the work across three agents in three workspaces. Each agent gets its own checkout. Use [`treq add`](https://treq.dev/docs/reference/cli#treq-add) and [`treq agent`](https://treq.dev/docs/reference/cli#treq-agent).
- Move changes between workspaces. Agents can move commits, working-copy files, and hunks through the CLI. See [`treq mv`](https://treq.dev/docs/reference/cli#treq-mv) and [moving files between workspaces](https://treq.dev/docs/how-to/moving-files-between-workspaces).
- Break up a large workspace. Tell an agent to split it into smaller stacked or separate workspaces. Each slice gets its own checkout. See [managing workspaces](https://treq.dev/docs/tutorials/managing-workspaces) and the [CLI](https://treq.dev/docs/reference/cli).
- Conflict resolution. From Changes, send a conflict with Plan or Edit. The agent can land a new commit that resolves the markers. On Commits, Resolve conflicts starts an agent that rewrites the conflicted commit in place. That path does not add a follow-up commit. See [conflict management](https://treq.dev/docs/concepts/changes-and-reviews#conflict-management) and [resolve commit conflicts inplace](https://treq.dev/docs/concepts/commit-management#resolve-commit-conflicts-inplace).
- Agent CLI. Workspace management can be delegated to agents through the [treq CLI](https://treq.dev/docs/reference/cli). Prompt an agent to create a workspace for this fix and it can run the same commands you would.
- Send files from the agent. `treq send` puts a thumbnail in that terminal. Click it to open the file. See [terminal sessions](https://treq.dev/docs/concepts/terminal-sessions) and [`treq send`](https://treq.dev/docs/reference/cli#treq-send).
- [Commit management](https://treq.dev/docs/concepts/commit-management). Commit selected files or the whole working copy. Review one commit or the cumulative stack. Tutorial: [committing changes](https://treq.dev/docs/tutorials/committing-changes).
- Schedule work. Hide a workspace until a time you pick. Shift commit timestamps into the future, or set them to now. Workspace lifecycle lives in [workspaces](https://treq.dev/docs/concepts/workspaces). Timestamp edits live in [commit management](https://treq.dev/docs/concepts/commit-management).
- [GitHub issues and pull requests](https://treq.dev/docs/concepts/github-integration). Manage issues and pull requests in the app. Start an agent from an issue. CI for the branch stays next to the workspace. How-to: [connecting GitHub](https://treq.dev/docs/how-to/connecting-github) and [creating and viewing pull requests](https://treq.dev/docs/how-to/creating-and-viewing-pull-requests).
- [Terminal sessions](https://treq.dev/docs/concepts/terminal-sessions). Shells and agents run in the workspace. Tutorial: [creating terminal sessions](https://treq.dev/docs/tutorials/creating-terminal-sessions).
- Local by default. Diffs, comments, and terminal metadata stay on your machine. The desktop app does not upload your code. See [security and privacy](https://treq.dev/docs/security-and-privacy).
- No telemetry. The app does not send feature usage, crash reports, or performance metrics. Docs-site analytics is separate. See [security and privacy](https://treq.dev/docs/security-and-privacy#telemetry).
- Git compatible. Jujutsu under the hood. Treq uses the jj-lib Rust crate to rebase workspace branches when targets move. See [under the hood](https://treq.dev/docs/under-the-hood).
- Apache 2.0 desktop app. You can read every command it runs. License is in this repository.
- macOS. Download the desktop build from [GitHub Releases](https://github.com/Ziinc/treq/releases) and open a Git repository you already have. Setup is in [installation](https://treq.dev/docs/getting-started/installation).

## Developer

### Regenerating screenshots

The committed hero is `assets/screenshots/code.png`. The site serves it from `web/static/img/code.png`. Landing crops live in `web/static/img/landing/` and ship with the docs build.

Regenerate with `npm run screenshot:readme`. Set `SKIP_LANDING_SCREENSHOTS=1` on docs-only CI so the site build does not recapture.

```bash
npm run screenshot:readme
# same as
npm run screenshot:landing
```

Specs live at `scripts/screenshot/specs/readme-*.spec.tsx`.

### Bumping the version

```bash
make bump           # prompts for the new version
make bump VERSION=0.1.3   # non-interactive
```

Updates `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `src-tauri/Cargo.lock` in one step.

```bash
# to profile benchmark code
samply record cargo bench --bench sync_workspaces
```

## License

Licensed under the Apache License, Version 2.0
