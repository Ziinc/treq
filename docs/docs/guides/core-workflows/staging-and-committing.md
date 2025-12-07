---
sidebar_position: 4
---

# Staging and Committing

_How to stage changes and create commits using Treq's visual tools._

Git uses a two-stage commit process: changes move from the working directory (unstaged) to the staging area (staged) before being committed. Treq's diff viewer makes this process visual, showing unstaged changes in orange and staged changes in green.

## Accessing the Diff Viewer

Open the diff viewer from the dashboard by clicking any changed file in the Git Changes section, or from a worktree session by clicking the Staging tab. The top section shows your file tree organized by staging status, and the bottom section displays the actual diff with Monaco Editor syntax highlighting.

## Staging Changes

**Staging files**: Click the + icon next to any unstaged file, or right-click and select "Stage File." Stage all files at once with the "Stage All" button or `Cmd+Shift+S`.

**Staging hunks**: A hunk is a contiguous block of changes. Click anywhere in a hunk and press the "Stage Hunk" button or `H` to stage just that section.

**Staging lines**: For fine-grained control, click a line number (or Shift+click to select a range), then click "Stage Selected Lines." This creates a partial patch—the file will appear in both staged and unstaged sections, showing what's ready to commit versus what remains.

To unstage, click the − icon on staged files, or use "Unstage All" (`Cmd+Shift+U`).

## Creating Commits

After staging, write your commit message in the text area. Follow conventional commit format: `type(scope): description`. Common types include `feat` for features, `fix` for bugs, `docs` for documentation, and `refactor` for restructuring. Keep the first line under 72 characters.

Click **Commit** or press `Cmd+Enter` to create the commit. Treq validates that you have staged files and a non-empty message before proceeding.

To amend the last commit (adding forgotten files or fixing the message), check "Amend Last Commit" before committing. Only amend commits that haven't been pushed.

## Reviewing Before Committing

Before staging, click through each changed file to understand what changed. Look for debug statements, console logs, commented code, and accidentally committed secrets. Use `Cmd+F` to search for keywords like "TODO" or "console.log." Treq marks files you've reviewed with a checkmark.

## Discarding Changes

**Unstaging** moves files back to unstaged without losing changes. **Discarding** permanently deletes changes—right-click a file and select "Discard Changes," then confirm. This cannot be undone.

Safer alternatives: stash changes with `git stash` to restore later, commit to a temporary branch, or use Treq's "Move to Worktree" feature to preserve changes elsewhere.

## Atomic Commits

Each commit should contain one logical change with all related files. Instead of one large commit mixing features, fixes, and documentation, create separate focused commits. This makes code review easier, simplifies reverting, and produces clearer project history.

Group related files, stage them, commit with a descriptive message, then repeat for the next logical change.

## Next Steps

- [Code Review Workflow](code-review-workflow) — Review changes with others
- [Merging Worktrees](merging-worktrees) — Merge commits to main
- [Pushing to Remote](../common-tasks/pushing-to-remote) — Share your commits
