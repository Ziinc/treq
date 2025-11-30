---
sidebar_position: 3
---

# Implementation Plans

Technical overview of Treq's plan parsing, storage, and execution system.

## Overview

Treq's implementation plan system parses structured markdown plans, stores them with metadata, and enables creating worktrees directly from plans to guide development.

## Plan Format

### Recognized Sections

Plans use markdown headers to denote sections:

```markdown
## Plan
High-level approach and design decisions

## Implementation Plan
Step-by-step tasks to complete

## Tasks
Checklist of specific items

## Suggestions
Optional improvements or alternatives
```

### Parsing

**Plan parser** (`src/lib/planParser.ts`):

```typescript
interface ParsedPlan {
  sections: PlanSection[];
  metadata: {
    title?: string;
    intent?: string;
    tags?: string[];
  };
}

interface PlanSection {
  type: 'plan' | 'implementation_plan' | 'tasks' | 'suggestions';
  content: string;
  startLine: number;
  endLine: number;
}
```

**Detection logic**:
1. Scans terminal output for markdown headers
2. Identifies plan section types
3. Extracts content for each section
4. Parses metadata from first lines

**Debouncing**:
- Parser runs 500ms after typing stops
- Prevents excessive re-parsing
- Improves performance

## Storage

### File Storage

**Plan files**: `.treq/plans/{uuid}.md`

```markdown
---
id: 550e8400-e29b-41d4-a716-446655440000
title: Add user authentication
created: 2024-01-15T10:30:00Z
worktree_id: abc123
status: completed
---

## Plan
Implementation approach...
```

**Metadata files**: `.treq/plans/{uuid}.json`

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Add user authentication",
  "intent": "Implement JWT-based auth",
  "created_at": "2024-01-15T10:30:00Z",
  "worktree_id": "abc123",
  "status": "completed",
  "tags": ["authentication", "security"]
}
```

### Database Storage

**Schema** (`plan_history` table):

```sql
CREATE TABLE plan_history (
  id TEXT PRIMARY KEY,
  title TEXT,
  intent TEXT,
  content TEXT,
  worktree_id TEXT,
  status TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  FOREIGN KEY (worktree_id) REFERENCES worktrees(id)
);
```

## Execution Flow

### Plan to Worktree

**Step 1: Parse Plan**
- Extract title and intent
- Identify main sections
- Generate branch name suggestion

**Step 2: Create Worktree Dialog**
- Pre-fill with plan data
- Branch name from title (sanitized)
- Intent as metadata
- User can edit before creating

**Step 3: Create Worktree**
- Standard worktree creation
- Associate plan ID with worktree
- Store plan metadata in database

**Step 4: Open Session**
- Open terminal in new worktree
- Display plan in plan panel
- Ready for implementation

### Plan Panel

**Display**:
- Markdown rendering with syntax highlighting
- Collapsible sections
- Line numbers for reference
- Search within plan

**Editing**:
- In-place editing
- Markdown preview
- Auto-save
- Validation

## Plan History

### Tracking

Plans automatically saved when:
- Executed (worktree created from plan)
- Manually saved by user
- Associated worktree deleted (archived)

### Search & Filter

**Search by**:
- Title keywords
- Content text
- Tags
- Date range

**Filter by**:
- Status (in-progress, completed, abandoned)
- Associated worktree (active/deleted)
- Creation date

### Export/Import

**Export formats**:
- Markdown (`.md`)
- JSON (with metadata)
- Plain text

**Import**:
- Drag-and-drop `.md` files
- Paste markdown text
- Import from file system

## Integration Points

### Terminal Integration

**Detection**:
- Watches terminal output for plan patterns
- Regex patterns for plan headers
- Markdown code block detection

**Extraction**:
- Captures plan content
- Preserves formatting
- Handles multi-line sections

### Review Integration

**Request Changes Flow**:
1. Reviewer adds comments during review
2. Clicks "Request Changes"
3. Treq generates plan from comments
4. Plan includes: issues to fix, suggestions to implement
5. Author executes plan to address feedback

**Generated plan structure**:
```markdown
## Code Review Feedback

### Issues to Address
- Line 45: Handle null case
- Line 67: Fix memory leak

### Suggestions
- Consider using async/await
- Add error logging

## Implementation Plan
1. Fix null handling on line 45
2. Add disposal logic on line 67
3. Refactor to async/await
4. Add error logging
```

### Git Integration

**Commit association**:
- Plans can be linked to commits
- Commit messages reference plan IDs
- View plan that led to commits

**Branch metadata**:
- Plans stored with branch
- Helps understand branch purpose
- Useful for code archaeology

## Performance

### Parsing Optimization

**Incremental parsing**:
- Only re-parses changed sections
- Caches parsed results
- Debounces parse calls

**Large plans**:
- Virtualizes display for 100+ line plans
- Lazy-loads plan content
- Pagination in history view

### Storage Optimization

**Database indexing**:
- Indexed by worktree_id
- Indexed by created_at
- Full-text search on content

**File cleanup**:
- Archives old plans (>90 days)
- Compresses archived plans
- Configurable retention policy

## Settings

### Plan Preferences

**Auto-save interval**: 5-60 seconds
**History retention**: 30-365 days
**Default status**: In-progress/draft
**Template location**: Custom path for plan templates

### Display

**Theme**: Follows editor theme
**Font**: Monospace font for code blocks
**Line numbers**: Show/hide
**Collapsible sections**: Default collapsed/expanded

## Limitations

**Size limits**:
- Maximum plan size: 10MB
- History entries: 1000 plans
- Search results: 100 at a time

**Format requirements**:
- Must use markdown headers (`##`)
- Section types must match known types
- Invalid markdown may not parse correctly

## Best Practices

1. **Clear sections**: Use proper markdown headers
2. **Descriptive titles**: Make plans findable
3. **Regular saves**: Don't rely only on auto-save
4. **Tag appropriately**: Use tags for organization
5. **Archive old plans**: Keep history manageable

## Learn More

- [Executing Implementation Plans Guide](/docs/guides/core-workflows/executing-implementation-plans)
- [Creating Worktrees](/docs/guides/common-tasks/creating-worktrees)
