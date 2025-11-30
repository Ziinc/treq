---
sidebar_position: 3
---

# Interface Overview

Learn your way around Treq's interface and understand what each element does.

This guide covers:
- Main dashboard layout and navigation
- Session sidebar and worktree management
- Git changes section and diff viewer
- Terminal interface and controls
- Command palette and keyboard shortcuts

- **Prerequisites**: Treq installed with a repository selected

## The Main Dashboard

When you open Treq, the dashboard is your central hub:

<!-- ![Treq dashboard overview](./images/interface-dashboard-overview.png) -->
*The main dashboard shows repository status, worktrees, and changes*

The dashboard is divided into three main areas:

### 1. Session Sidebar (Left)

The left sidebar contains:

**Top Section**:
- **Repository name** and current view
- **Command Palette** button (`Cmd+K` / `Ctrl+K`)
- **New Worktree** button (`Cmd+N` / `Ctrl+N`)

**Session Tabs**:
- **Dashboard**: Overview of all worktrees
- **Main**: Main repository terminal (optional)
- **Worktree sessions**: One tab per open worktree
- Session indicators (● active, ○ inactive)

**Bottom Section**:
- **Settings** button (⚙️)
- **Help & Documentation** link

<!-- ![Session sidebar](./images/interface-sidebar.png) -->
*The session sidebar manages navigation between worktrees and the dashboard*

### 2. Main Content Area (Center/Right)

The main area changes based on your current view:

**Dashboard View**: Shows worktrees and repository info
**Session View**: Shows terminal and diff viewer
**Settings View**: Configuration options
**Review View**: Code review interface (when reviewing)

## Dashboard View Components

### Main Repository Section

Located on the left side of the dashboard:

<!-- ![Main repository section](./images/interface-main-repo.png) -->
*The main repository section shows your primary branch status*

**Current Branch Info**:
- Branch name (e.g., `main`, `develop`)
- Commits ahead/behind remote (e.g., `↑2 ↓1`)
- Sync status with remote

**Git Changes**:
- **Staged Changes**: Files ready to commit (green)
- **Unstaged Changes**: Modified files not yet staged (orange)
- File count and action buttons

**Commit Controls**:
- Commit message input
- **Stage All** button
- **Commit** button (`Cmd+Enter` / `Ctrl+Enter`)

**Quick Actions**:
- **Pull**: Fetch and merge from remote
- **Push**: Push commits to remote
- **Refresh**: Update status (`Cmd+R` / `Ctrl+R`)

### Worktrees Section

Located on the right side of the dashboard:

<!-- ![Worktrees section](./images/interface-worktrees.png) -->
*The worktrees section displays all your active worktrees as cards*

Each worktree is represented by a **worktree card** showing:

**Header**:
- Branch name
- Plan title (if set)

**Status Indicators**:
- **↑X ↓Y**: Commits ahead (X) and behind (Y) base branch
- **📊**: Uncommitted changes present
- **🔒**: Has uncommitted changes that need attention
- **✓**: All changes committed

**Actions** (bottom buttons):
- **Open**: Open terminal session
- **View**: Open diff viewer
- **Merge**: Merge into another branch
- **Delete**: Remove worktree

**Context Menu** (right-click or ⋮):
- Rename worktree
- Change plan title
- Open in file explorer
- Copy path

## Session View Components

When you click "Open" on a worktree or switch to a session tab:

<!-- ![Session view](./images/interface-session-view.png) -->
*The session view provides a full terminal and diff viewer*

### Terminal Panel

The left side shows an integrated terminal:

**Terminal Features**:
- Full xterm.js terminal with PTY support
- Current working directory displayed
- Session name at the top
- Terminal tabs (if multiple sessions in one worktree)

**Terminal Actions** (top-right icons):
- **+**: New terminal in this worktree
- **⚙️**: Terminal settings
- **↻**: Restart terminal
- **✕**: Close terminal (keeps session)

**Terminal Capabilities**:
- Copy/paste with `Cmd+C`/`Cmd+V`
- Search with `Cmd+F`
- Clickable URLs
- Full Unicode and emoji support
- Ligatures (if your font supports them)

### Diff Viewer Panel (Optional)

The right side can show a diff viewer:

<!-- ![Diff viewer panel](./images/interface-diff-viewer.png) -->
*The diff viewer shows staged and unstaged changes side-by-side*

**File Tree** (top):
- Staged files section (green)
- Unstaged files section (orange)
- File count and status icons
- Virtual scrolling for large file lists

**Diff Display** (bottom):
- Monaco editor with syntax highlighting
- Line numbers and change indicators
- **+ Line added** (green)
- **- Line removed** (red)
- **~ Line modified** (yellow)

**Actions**:
- **Stage Line**: Stage specific lines
- **Stage Hunk**: Stage a chunk of changes
- **Stage File**: Stage entire file
- **View Full**: Open in full-screen diff view

### Plan Panel (Bottom)

When working with implementation plans:

<!-- ![Plan panel](./images/interface-plan-panel.png) -->
*The plan panel shows your implementation plan and execution status*

**Plan Display**:
- Formatted plan with sections
- Syntax highlighting for code blocks
- Collapsible sections

**Execution Controls**:
- **Execute**: Run plan in current terminal
- **Edit**: Modify the plan
- **Save**: Save plan to history
- **Clear**: Remove plan from view

## Code Review View

When reviewing code (accessed via worktree "Review" button):

<!-- ![Code review view](./images/interface-review-view.png) -->
*The review view provides tools for inline comments and annotations*

**File Tree** (left):
- Hierarchical file structure
- Change indicators per file
- **✓**: Viewed files
- **○**: Not yet viewed

**Diff Viewer** (center):
- Branch comparison view
- Before/after side-by-side
- Line-level diff highlighting

**Annotation Panel** (right):
- Click lines to add comments
- Comment thread for each annotation
- Review summary
- **Request Changes** button
- **Approve** button

**Commit History** (bottom):
- List of commits in this branch
- Commit messages and authors
- Click to view specific commit

## Git Changes Section

Available in both dashboard and session views:

<!-- ![Git changes detailed](./images/interface-git-changes.png) -->
*Git changes section shows file-level detail and staging options*

**File List Features**:
- File path and status icon:
  - **M**: Modified
  - **A**: Added
  - **D**: Deleted
  - **R**: Renamed
  - **??**: Untracked
- File size (for added files)
- Last modified time

**Per-File Actions**:
- **View Diff**: Open file in diff viewer
- **Stage/Unstage**: Toggle staging
- **Discard**: Revert changes (with confirmation)
- **Move to Worktree**: Transfer to another worktree

**Multi-Select**:
- Click + `Shift` to select range
- Click + `Cmd/Ctrl` to select individual files
- Batch actions available for selection

## Command Palette

Press `Cmd+K` / `Ctrl+K` to open the command palette:

<!-- ![Command palette](./images/interface-command-palette.png) -->
*The command palette provides quick access to all actions*

**Search Features**:
- Fuzzy search by command name
- Recent commands at top
- Keyboard navigation (↑/↓)
- Press `Enter` to execute

**Available Commands**:
- Navigation (Dashboard, Settings, Sessions)
- Worktree actions (New, Delete, Merge)
- Git operations (Commit, Push, Pull)
- View toggles (Show/Hide panels)
- Settings and preferences

## Status Bar (Bottom)

The bottom status bar shows:

**Left Side**:
- Current branch name
- Git status (synced, ahead, behind)
- Uncommitted changes count

**Center**:
- Background operation status
- Loading indicators
- Error/warning messages

**Right Side**:
- Connected repository path
- Database status
- App version

## Keyboard Shortcuts

Essential keyboard shortcuts for efficient navigation:

### Global
- `Cmd/Ctrl+K`: Open command palette
- `Cmd/Ctrl+N`: New worktree
- `Cmd/Ctrl+R`: Refresh dashboard
- `Cmd/Ctrl+D`: Go to dashboard
- `Cmd/Ctrl+,`: Open settings
- `Cmd/Ctrl+W`: Close current tab

### Terminal
- `Cmd/Ctrl+C`: Copy selection
- `Cmd/Ctrl+V`: Paste
- `Cmd/Ctrl+F`: Find in terminal
- `Cmd/Ctrl+L`: Clear terminal

### Git Operations
- `Cmd/Ctrl+Enter`: Commit (when commit message is focused)
- `Cmd/Ctrl+Shift+S`: Stage all
- `Cmd/Ctrl+Shift+U`: Unstage all

See the full [**Keyboard Shortcuts Guide**](/docs/keyboard-shortcuts) for more.

## Customizing the Interface

You can customize various aspects in Settings (`Cmd+,` / `Ctrl+,`):

**Theme**:
- Light or dark mode
- Follows system preference option

**Terminal**:
- Font family and size
- Shell preference (bash, zsh, fish, etc.)
- Scrollback buffer size

**Diff Viewer**:
- Line numbers on/off
- Minimap on/off
- Word wrap settings

**Layout**:
- Sidebar position (left/right)
- Panel sizes and visibility
- Default view on startup

## Understanding Visual Indicators

### Color Coding

Treq uses consistent colors throughout:

- **🟢 Green**: Staged, ready, or successful
- **🟡 Orange/Yellow**: Unstaged or warning
- **🔴 Red**: Error or deleted
- **🔵 Blue**: Info or selected
- **⚪ Gray**: Inactive or disabled

### Icons

Common icons and their meanings:

- **📁**: Folder or directory
- **📄**: File
- **✓**: Completed or viewed
- **○**: Pending or not viewed
- **↻**: Refresh or sync
- **⚙️**: Settings
- **⋮**: More options menu
- **✕**: Close or delete
- **+**: Add or create

## Tips for Navigation

1. **Use Keyboard Shortcuts**: Much faster than clicking
2. **Command Palette**: When you forget a shortcut, `Cmd+K` has everything
3. **Tab Between Sessions**: Click session tabs or use `Cmd+1, 2, 3...`
4. **Right-Click Menus**: Context menus have quick actions
5. **Dashboard as Home**: Press `Cmd+D` to quickly return to overview

## Common Workflows

### Quick File Staging
1. Dashboard view
2. Click on changed files in main repo section
3. Review in diff viewer
4. Stage/commit from there

### Switching Between Worktrees
1. Click session tab in sidebar
2. Or use command palette (`Cmd+K` → type worktree name)

### Reviewing Changes Before Commit
1. Open diff viewer
2. Review each changed file
3. Stage selectively
4. Commit when ready

## Accessibility Features

Treq includes accessibility support:

- **Keyboard Navigation**: Full keyboard control
- **Screen Reader**: ARIA labels and semantic HTML
- **High Contrast**: Supports system high-contrast mode
- **Font Scaling**: Terminal font size adjustable
- **Color Blind Friendly**: Icons supplement color coding

## Next Steps

Now that you understand the interface, dive into practical workflows:

- [**Using Treq with a Git Repo**](../core-workflows/using-treq-with-git-repo) - Set up your workflow
- [**Core Workflows**](../core-workflows/creating-terminal-sessions) - Essential tasks
- [**Tips & Tricks**](../tips-and-tricks/customizing-settings) - Work more efficiently
