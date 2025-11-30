---
sidebar_position: 5
---

# Code Review

Technical overview of Treq's code review system with inline annotations.

## Overview

Treq's review system provides a dedicated interface for examining branch differences, adding inline comments, and generating structured review summaries.

## Architecture

### Components

**Review UI**:
- File tree with change indicators
- Diff viewer with annotation support
- Comment panel with threading
- Summary generation

**Data Storage**:
- Comments stored in local database
- Associated with file paths and line numbers
- Exportable to external formats

**Integration**:
- Links to worktrees
- Connects with implementation plans
- Exports to PR platforms

## Review Interface

### File Tree

**Structure**:
```typescript
interface FileTreeNode {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed';
  viewed: boolean;
  commentCount: number;
  children?: FileTreeNode[];
}
```

**Features**:
- Hierarchical folder structure
- Change indicators per file
- Viewed status tracking
- Comment count badges
- Virtual scrolling for large repos

### Diff Display

**Rendering**:
- Monaco Editor for syntax highlighting
- Side-by-side or unified mode
- Line number gutters
- Change indicators (+/-)

**Modes**:
- **Side-by-side**: Before/after columns
- **Unified**: Single column with +/- prefix

**Navigation**:
- Click files in tree
- Keyboard: `J`/`K` for next/previous
- Jump to specific lines

## Annotation System

### Comment Model

```typescript
interface ReviewComment {
  id: string;
  filePath: string;
  lineNumber: number;
  lineRange?: [number, number];
  content: string;
  type: 'question' | 'issue' | 'suggestion' | 'praise' | 'nitpick';
  createdAt: Date;
  replies: ReviewComment[];
}
```

### Adding Comments

**Process**:
1. User clicks line number
2. Comment input appears
3. User types comment (markdown supported)
4. Click "Add" or `Cmd+Enter`
5. Comment stored in database
6. Displayed in UI

**Line ranges**:
- Click first line
- Shift+click last line
- Comment applies to range

**Threading**:
- Click "Reply" on existing comment
- Nested comment created
- Indented display in panel

### Comment Types

**Visual indicators**:
- ❓ Question: Need clarification
- ⚠️ Issue: Must be fixed
- 💡 Suggestion: Optional improvement
- 👍 Praise: Positive feedback
- 🔧 Nitpick: Minor style/convention

### Storage

**Database schema**:
```sql
CREATE TABLE review_comments (
  id TEXT PRIMARY KEY,
  worktree_id TEXT,
  file_path TEXT,
  line_number INTEGER,
  line_range_end INTEGER,
  content TEXT,
  type TEXT,
  parent_id TEXT,
  created_at TIMESTAMP,
  FOREIGN KEY (worktree_id) REFERENCES worktrees(id),
  FOREIGN KEY (parent_id) REFERENCES review_comments(id)
);
```

## Review Summary

### Generation

**Aggregation**:
1. Collect all comments
2. Group by file
3. Sort by line number
4. Format as markdown

**Template**:
```markdown
## Code Review Summary

**Reviewer**: {name}
**Date**: {date}
**Status**: {status}

### Files Reviewed
- [x] src/auth.js (3 comments)
- [x] src/middleware.js (1 comment)

### Comments

#### src/auth.js:23
⚠️ This function doesn't handle null inputs

#### src/auth.js:45
💡 Consider using async/await here

### Overall Feedback
{summary_text}
```

### Export Formats

**Markdown**:
- Copy to clipboard
- Save as `.md` file
- Paste into PR description

**JSON**:
- Full comment data
- Metadata included
- Machine-readable

**Plain text**:
- Simple formatting
- Email-friendly

## Review States

### Status Tracking

```typescript
enum ReviewStatus {
  DRAFT = 'draft',
  IN_PROGRESS = 'in_progress',
  CHANGES_REQUESTED = 'changes_requested',
  APPROVED = 'approved'
}
```

**Transitions**:
- Draft → In Progress (start reviewing)
- In Progress → Changes Requested (issues found)
- In Progress → Approved (looks good)
- Any → Draft (reset)

**Storage**: Stored per worktree in database

### Approval Workflow

**Approve**:
1. User clicks "Approve"
2. Status → Approved
3. Timestamp recorded
4. Optional approval message

**Request Changes**:
1. User clicks "Request Changes"
2. Status → Changes Requested
3. Comments highlighted
4. Optional: Generate plan from comments

## Plan Integration

### Generate Plan from Review

**Process**:
1. Collect all "Issue" and "Suggestion" comments
2. Convert to implementation tasks
3. Create plan structure:
   ```markdown
   ## Issues to Address
   - {file}:{line}: {comment}

   ## Suggestions
   - {file}:{line}: {comment}

   ## Implementation Plan
   1. Fix {issue}
   2. Implement {suggestion}
   ```
4. Open plan in editor
5. Author can execute plan

**Mapping**:
- Issue → Required task
- Suggestion → Optional task
- Question → Note to address
- Nitpick → Low priority

## Commit History

### Display

**Commits in branch**:
```bash
git log --oneline --reverse main..feature-branch
```

**UI showing**:
- Commit hash (short)
- Commit message (first line)
- Author and date
- File changes in commit

**Interaction**:
- Click commit to view its diff
- Filter comments by commit
- Jump to specific commit changes

### Commit-Level Review

**Review entire commit**:
- View files changed in commit
- Add comments specific to commit
- Compare commit to parent

## Performance

### Large Diffs

**Optimizations**:
- Virtualize file tree (only render visible)
- Lazy-load diffs (on file select)
- Truncate very large files (>10,000 lines)
- Pagination for commits (20 at a time)

### Comment Loading

**Strategy**:
- Load comments on demand per file
- Cache loaded comments
- Batch DB queries
- Index by file_path and worktree_id

## Settings

### Review Preferences

**Display**:
- Default mode (side-by-side/unified)
- Line numbers on/off
- Syntax highlighting theme

**Behavior**:
- Auto-mark files as reviewed
- Confirm before approving
- Default comment type

## Limitations

**Storage**:
- Comments are local only
- Not synced to remote
- Must export for sharing

**Integration**:
- No direct GitHub/GitLab API
- Manual export/import
- No real-time collaboration

**Capacity**:
- Large reviews (100+ files) may be slow
- Comment count should stay < 1000 per review

## Best Practices

1. **Review in batches**: Don't try to review 100 files at once
2. **Be specific**: Reference exact lines and issues
3. **Be constructive**: Suggest solutions, not just problems
4. **Use types**: Categorize comments appropriately
5. **Export regularly**: Save review progress externally

## Learn More

- [Code Review Workflow Guide](/docs/guides/core-workflows/code-review-workflow)
- [Merging Worktrees](/docs/guides/core-workflows/merging-worktrees)
