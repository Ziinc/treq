---
sidebar_position: 5
---

# Code Review Workflow

_How to review code using Treq's built-in review tools._

Treq's review interface lets you examine changes in a dedicated worktree without disrupting your current work. You can add inline comments, test changes locally, and export review summaries for pull requests.

## Starting a Review

Click the **Review** button on any worktree in the dashboard. To review someone else's branch, first fetch remote changes (`git fetch origin`), create a worktree from their branch via "New Worktree" → "From existing branch," then open the review interface.

## The Review Interface

The interface has four areas. The **file tree** on the left shows all changed files with status indicators (M for modified, A for added, D for deleted) and checkmarks for files you've reviewed. The **diff viewer** in the center displays side-by-side or unified diffs with syntax highlighting—click any line to add a comment. The **review panel** on the right collects all your comments and provides export options. The **commit history** at the bottom lets you review individual commits or the cumulative diff.

Navigate files with arrow keys, press Enter to open, and Space to mark as reviewed. Toggle between side-by-side and unified diff modes in the toolbar.

## Adding Comments

Click a line number to add an inline comment. Use markdown for formatting and prefix with emojis to indicate type: ❓ for questions, 💡 for suggestions, ⚠️ for issues, 👍 for praise. For multi-line comments, Shift+click to select a range. Reply to existing comments to create threads, and hover over your comments to edit or delete them.

## Completing the Review

When you've reviewed all files, choose your verdict. Click **Approve** if everything looks good, or **Request Changes** if issues need fixing. Add an overall summary comment explaining your decision.

The review panel shows your progress: total comments, files reviewed, and diff statistics. Use **Copy Summary** to generate formatted markdown you can paste into GitHub, GitLab, or other platforms.

## Testing Locally

Since the worktree contains the actual code, you can run it during review. Open a terminal session, install dependencies if needed, run the application, and execute tests. Finding bugs locally is more valuable than catching them after merge.

## Tips

Review commit-by-commit to understand the development progression, or view the cumulative diff for small changes. Establish team guidelines for response times and approval requirements. Be constructive in feedback—suggest solutions, not just problems.

## Keyboard Shortcuts

`J`/`K` for next/previous file, `C` to add comment, `R` to mark reviewed, `A` to approve, `X` to request changes.

## Next Steps

- [Merging Worktrees](merging-worktrees) — Merge approved changes
- [Staging and Committing](staging-and-committing) — Fix review feedback
