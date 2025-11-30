---
sidebar_position: 6
---

# Diff Viewer

Technical overview of Treq's visual diff viewer and line-level staging.

## Overview

Treq's diff viewer uses Monaco Editor for syntax-highlighted diffs with support for line-level staging, hunk operations, and file tree management.

## Architecture

### Components

**File Tree** (top):
- React component with virtual scrolling
- Staged/unstaged sections
- File status indicators
- Multi-select support

**Diff Display** (bottom):
- Monaco Editor instance
- Custom diff renderer
- Line-level interaction
- Syntax highlighting

**State Management**:
- React Query for data fetching
- Local state for selections
- Database cache for diffs

## Monaco Editor Integration

### Setup

```typescript
import * as monaco from 'monaco-editor';

const diffEditor = monaco.editor.createDiffEditor(container, {
  readOnly: true,
  renderSideBySide: true,
  originalEditable: false,
  modifiedEditable: false,
  theme: 'vs-dark',
  minimap: { enabled: true },
  scrollBeyondLastLine: false
});
```

### Diff Model

```typescript
const originalModel = monaco.editor.createModel(
  originalContent,
  language,
  monaco.Uri.parse('file:///original.js')
);

const modifiedModel = monaco.editor.createModel(
  modifiedContent,
  language,
  monaco.Uri.parse('file:///modified.js')
);

diffEditor.setModel({
  original: originalModel,
  modified: modifiedModel
});
```

### Language Detection

**By file extension**:
```typescript
const getLanguage = (path: string) => {
  const ext = path.split('.').pop();
  const languageMap = {
    js: 'javascript',
    ts: 'typescript',
    py: 'python',
    rs: 'rust',
    // ... 100+ languages
  };
  return languageMap[ext] || 'plaintext';
};
```

**Auto-detection**:
- Uses file extension
- Falls back to content analysis
- Defaults to plaintext

## File Tree

### Virtualization

**Why virtualize**: Large repos may have 1000+ changed files

**Implementation**: react-window

```typescript
import { FixedSizeList } from 'react-window';

<FixedSizeList
  height={600}
  itemCount={files.length}
  itemSize={30}
  width="100%"
>
  {({ index, style }) => (
    <FileRow
      file={files[index]}
      style={style}
    />
  )}
</FixedSizeList>
```

**Benefits**:
- Only renders visible items (~20)
- Smooth scrolling
- Low memory usage

### File Status

**Status codes**:
```typescript
enum FileStatus {
  MODIFIED = 'M',
  ADDED = 'A',
  DELETED = 'D',
  RENAMED = 'R',
  UNTRACKED = '??'
}
```

**Visual indicators**:
- M: Orange "M" badge
- A: Green "A" badge
- D: Red "D" badge
- R: Blue "R" badge
- ??: Gray "?" badge

### Multi-Select

**Selection modes**:
- Click: Select single file
- Cmd+Click: Toggle selection
- Shift+Click: Range selection

**State tracking**:
```typescript
const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
```

**Bulk actions**:
- Stage all selected
- Unstage all selected
- Discard all selected

## Diff Generation

### Git Diff

**Unstaged changes**:
```bash
git diff path/to/file
```

**Staged changes**:
```bash
git diff --cached path/to/file
```

**Output parsing**:
```
diff --git a/file.js b/file.js
index abc123..def456 100644
--- a/file.js
+++ b/file.js
@@ -10,6 +10,8 @@ function example() {
  context line
- removed line
+ added line
+ added line 2
  context line
```

### Hunk Extraction

**Hunk structure**:
```typescript
interface Hunk {
  header: string;  // @@ -10,6 +10,8 @@
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

interface DiffLine {
  type: 'context' | 'addition' | 'deletion';
  oldLineNumber?: number;
  newLineNumber?: number;
  content: string;
}
```

**Parser**:
1. Split diff by hunk headers
2. Parse header numbers
3. Process lines (-, +, or context)
4. Calculate line numbers
5. Store in memory

## Line-Level Staging

### Selection

**User interaction**:
1. Click line number in diff
2. Line highlighted
3. Shift+click for range
4. Multiple ranges supported

**State**:
```typescript
interface Selection {
  startLine: number;
  endLine: number;
  hunkIndex: number;
}
```

### Patch Generation

**Creating patch**:
1. Extract selected lines from hunk
2. Adjust hunk header numbers
3. Generate valid git patch
4. Include context lines (3 before/after)

**Example patch**:
```diff
diff --git a/file.js b/file.js
index abc123..def456 100644
--- a/file.js
+++ b/file.js
@@ -10,3 +10,4 @@ function example() {
  context
  context
+ new line (selected)
  context
```

### Apply Patch

**Git command**:
```bash
git apply --cached <<EOF
{patch_content}
EOF
```

**Error handling**:
- Patch may not apply cleanly
- Retry with more context
- Fall back to full file staging

## Syntax Highlighting

### Prism.js

**For static diffs**:
```typescript
import Prism from 'prismjs';

const highlightedCode = Prism.highlight(
  code,
  Prism.languages.javascript,
  'javascript'
);
```

**Languages supported**: 100+ languages

### Monaco Editor

**For interactive diffs**:
- Uses Monaco's built-in highlighter
- Same engine as VS Code
- Supports all major languages
- Semantic tokenization

## Performance Optimizations

### Lazy Loading

**Strategy**:
- Load file tree immediately (from cache)
- Load first file diff
- Load other diffs on-demand (when clicked)
- Cache loaded diffs

**Impact**:
- Initial load: `<100ms`
- Diff generation: 50-200ms per file
- Cached: `<10ms`

### Diff Caching

**Cache key**: `${filePath}:${fileHash}`

**Invalidation**:
- File modified
- Git operation executed
- Manual refresh

**Storage**: SQLite database

```sql
CREATE TABLE diff_cache (
  file_path TEXT,
  file_hash TEXT,
  diff_content TEXT,
  hunks JSONB,
  created_at TIMESTAMP,
  PRIMARY KEY (file_path, file_hash)
);
```

### Minimap Optimization

**Large files** (>1000 lines):
- Minimap disabled by default
- Option to enable
- Alternative: Scrollbar with indicators

### Memory Management

**Disposing models**:
```typescript
useEffect(() => {
  return () => {
    originalModel?.dispose();
    modifiedModel?.dispose();
    diffEditor?.dispose();
  };
}, []);
```

**Prevents memory leaks** when switching files.

## Binary Files

### Detection

**Methods**:
1. File extension check (`.png`, `.jpg`, etc.)
2. Git binary attribute
3. Content sniffing (null bytes)

### Display

**Instead of diff**:
- Show "Binary file" message
- Display file size (before/after)
- Show file type/extension
- Offer "Open" button (external app)

### Operations

- Can stage/unstage entire file
- Cannot view diff
- Cannot stage partial changes

## Settings

### Display

**Line numbers**: Show/hide
**Minimap**: Enable/disable
**Word wrap**: Wrap long lines
**Diff algorithm**: myers, minimal, patience, histogram

### Behavior

**Auto-scroll**: Follow selections
**Context lines**: 3-10 lines around changes
**Ignore whitespace**: Show/hide whitespace changes

### Theme

**Monaco themes**:
- VS Light
- VS Dark
- High Contrast

**Syntax themes**:
- GitHub
- Monokai
- Solarized
- Custom

## Limitations

**File size**: Files >10,000 lines may be slow
**Binary files**: No visual diff
**Very long lines**: May cause horizontal scrolling issues
**Complex merges**: 3-way diffs not supported

## Best Practices

1. **Review before staging**: Always check diff
2. **Use line staging**: Create focused commits
3. **Close large diffs**: Free memory when done
4. **Enable virtualization**: For repos with many files
5. **Refresh periodically**: Keep diffs current

## Learn More

- [Staging and Committing Guide](/docs/guides/core-workflows/staging-and-committing)
- [Code Review Workflow](/docs/guides/core-workflows/code-review-workflow)
