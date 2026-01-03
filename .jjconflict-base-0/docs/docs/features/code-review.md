---
sidebar_position: 5
---

# Code Review

_Technical overview of Treq's code review system._

Treq's review system provides a dedicated interface for examining branch differences, adding inline comments, and generating structured review summaries. Reviews are stored locally per worktree and can be exported for sharing.

## Interface

The review interface has four sections. The **file tree** shows all changed files with status indicators (M/A/D/R), viewed checkmarks, and comment count badges. The **diff viewer** renders syntax-highlighted diffs using Monaco Editor in side-by-side or unified mode. The **comment panel** displays all annotations with threading support. The **commit history** shows commits in the branch, clickable to view individual commit diffs.

## Annotation System

Click any line number to add a comment. Markdown is supported, and comments can be categorized by type: ❓ question, ⚠️ issue, 💡 suggestion, 👍 praise, or 🔧 nitpick. For multi-line comments, Shift+click to select a range. Reply to existing comments to create threads.

Comments are collected by file and line number, displayed in the panel, and can be exported as markdown for pasting into pull requests or other platforms.

## Review States

Reviews progress through states: draft (in progress), changes requested (issues found), or approved (ready to merge). Clicking "Approve" or "Request Changes" sets the status and records a timestamp. Optionally, Treq can generate an implementation plan from review comments—converting issues and suggestions into tasks the author can execute.

## Commit-Level Review

The commit history panel shows all commits in the branch with hash, message, author, and date. Click any commit to view its specific diff, useful for understanding the development progression or reviewing changes incrementally rather than as a cumulative diff.

## Export

Review summaries can be exported as markdown (copy to clipboard or save as file), JSON (full data with metadata), or plain text. The generated format includes reviewer name, date, status, files reviewed with comment counts, all comments organized by file and line, and overall feedback.

## Limitations

Comments are local only—they're not synced to remote repositories. Export and share manually. Large reviews (100+ files) may load slowly. For real-time collaboration, use external PR platforms and import/export review summaries.

## Learn More

- [Code Review Workflow Guide](/docs/guides/core-workflows/code-review-workflow)
- [Merging Worktrees](/docs/guides/core-workflows/merging-worktrees)
