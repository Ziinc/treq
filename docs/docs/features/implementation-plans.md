---
sidebar_position: 3
---

# Implementation Plans

_Technical overview of Treq's plan parsing, storage, and execution system._

Treq's implementation plan system parses structured markdown plans from terminal output, stores them with metadata, and enables creating worktrees directly from plans to guide development.

## Plan Format

Plans use markdown headers to denote sections. The parser recognizes four section types: **Plan** for high-level approach and design decisions, **Implementation Plan** for step-by-step tasks, **Tasks** for checklists of specific items, and **Suggestions** for optional improvements. Each section is extracted with its content and line numbers for display in the plan panel.

The parser watches terminal output for these markdown patterns, debouncing at 500ms to avoid excessive re-parsing during active output.

## Storage

Plans are stored as markdown files in `.treq/plans/{uuid}.md` with YAML frontmatter containing metadata (id, title, creation date, associated worktree, status). Plan history is also stored in a database table for search and filtering.

When you create a worktree from a plan, Treq extracts the title and intent to pre-fill the creation dialog, generates a sanitized branch name suggestion, and associates the plan with the new worktree.

## Plan Panel

The session view displays plans in a dedicated panel with markdown rendering, syntax highlighting for code blocks, collapsible sections, and in-place editing with auto-save. You can search within the plan and edit it as implementation progresses.

## History and Search

Plans are automatically saved when executed (worktree created from plan), manually saved, or when an associated worktree is deleted. Search by title, content keywords, or tags. Filter by status (in-progress, completed, abandoned), associated worktree, or date range.

Export plans as markdown, JSON with metadata, or plain text. Import by dragging and dropping `.md` files or pasting markdown directly.

## Review Integration

When a reviewer clicks "Request Changes," Treq can generate a plan from review comments. Issues become required tasks, suggestions become optional tasks. The author can then execute this plan to address feedback systematically.

## Limitations

Maximum plan size is 10MB. Plan history retains up to 1000 entries. Plans must use proper markdown headers (`##`) with recognized section types. Invalid markdown may not parse correctly.

## Learn More

- [Executing Implementation Plans Guide](/docs/guides/core-workflows/executing-implementation-plans)
- [Creating Worktrees](/docs/guides/common-tasks/creating-worktrees)
