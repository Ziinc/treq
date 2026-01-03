---
sidebar_position: 6
---

# Diff Viewer

_Technical overview of Treq's visual diff viewer and line-level staging._

Treq's diff viewer combines a file tree with Monaco Editor to display syntax-highlighted diffs. It supports line-level staging, hunk operations, and bulk file actions for precise commit construction.

## Interface Layout

The diff viewer has two main sections. The **file tree** at the top shows all changed files organized into staged and unstaged sections, with status badges indicating whether each file was modified (M), added (A), deleted (D), renamed (R), or is untracked (?). The **diff display** below uses Monaco Editor to render side-by-side diffs with full syntax highlighting for 100+ languages.

Files are virtualized using react-window, so even repositories with thousands of changed files scroll smoothly. Clicking a file loads its diff on demand; subsequent views are cached for instant display.

## Staging Operations

You can stage changes at three levels of granularity. **File-level staging** moves entire files between staged and unstaged sections. **Hunk staging** lets you stage or unstage individual change blocks within a file. **Line-level staging** provides the finest control, allowing you to select specific lines to include in or exclude from the next commit.

Multi-select is supported in the file tree: click to select a single file, Cmd+Click to toggle selection, or Shift+Click for range selection. Selected files can be staged, unstaged, or discarded in bulk.

## Binary Files

Binary files (images, compiled assets, etc.) display a placeholder message instead of a diff. You can still stage or unstage the entire file, but partial staging isn't available. The viewer shows file size before and after the change.

## Settings

Display options include line numbers, minimap visibility, word wrap, and diff algorithm selection (myers, minimal, patience, histogram). You can adjust context lines (3-10 lines around changes) and toggle whitespace visibility. Monaco themes (VS Light, VS Dark, High Contrast) follow the application theme.

## Limitations

Files exceeding 10,000 lines may experience slower rendering. Three-way merge diffs are not supported—use the terminal for complex merge conflict resolution.

## Learn More

- [Staging and Committing Guide](/docs/guides/core-workflows/staging-and-committing)
- [Code Review Workflow](/docs/guides/core-workflows/code-review-workflow)
