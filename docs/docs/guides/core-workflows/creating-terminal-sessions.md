---
sidebar_position: 2
---

# Creating Terminal Sessions

Master Treq's integrated terminal sessions for efficient development across multiple worktrees.

This guide covers:
- Creating and managing terminal sessions
- Understanding session persistence
- Working with multiple terminals per worktree
- Switching between sessions efficiently
- Best practices for session management

- **Prerequisites**: Treq installed with at least one worktree created

## Understanding Terminal Sessions

### What are Terminal Sessions?

A **terminal session** in Treq is:
- A full PTY (pseudo-terminal) with your default shell
- Bound to a specific worktree's directory
- Persistent across app restarts
- Capable of running any command you'd run in a regular terminal

**Key Features**:
- Full xterm.js terminal emulation
- Output preserved when switching sessions
- Multiple sessions per worktree supported
- Search, copy/paste, and clickable URLs

### Sessions vs Terminals

- **Session**: A persistent container for one or more terminals
- **Terminal**: The actual shell instance running commands

Think of sessions as tabs and terminals as the shell processes within them.

## Creating Your First Session

### Automatic Session Creation

When you create a new worktree, Treq automatically:
1. Creates a terminal session for that worktree
2. Sets working directory to the worktree path
3. Opens the session (if you clicked "Open")

<!-- ![Automatic session creation](./images/sessions-automatic.png) -->
*New sessions appear in the sidebar when you create worktrees*

### Manual Session Creation

To create an additional session for an existing worktree:

1. Right-click on the worktree card
2. Select **"New Session"**
3. Or click the **"+"** icon in the worktree's session tab

The new session opens with:
- Working directory: `{repo}/.treq/worktrees/{branch-name}/`
- Your default shell (bash, zsh, fish, etc.)
- Empty terminal buffer

## Session Management

### Naming Sessions

Give your sessions meaningful names to stay organized:

1. Right-click on the session tab
2. Select **"Rename Session"**
3. Enter a descriptive name (e.g., "Dev Server", "Tests", "Build")

<!-- ![Renamed sessions](./images/sessions-named.png) -->
*Named sessions help you quickly identify their purpose*

**Naming Conventions**:
- **By purpose**: "Dev Server", "Tests", "Documentation"
- **By command**: "npm run dev", "pytest", "cargo build"
- **By task**: "Frontend", "Backend", "Database Setup"

### Session Indicators

Session tabs show status indicators:

- **● Green**: Active session (currently focused)
- **○ Gray**: Inactive session (backgrounded)
- **◆ Yellow**: Session with unread output
- **✕**: Session with error/exit status

### Switching Between Sessions

**Method 1: Click Session Tab**
- Simply click the session tab in the sidebar

**Method 2: Keyboard Shortcuts**
- `Cmd+1` through `Cmd+9`: Jump to session 1-9
- `Cmd+[` / `Cmd+]`: Previous/Next session

**Method 3: Command Palette**
- Press `Cmd+K`
- Type session name
- Press Enter

## Working with Multiple Sessions

### When to Use Multiple Sessions

Create additional sessions for:

**Long-running processes**:
- Development server in one session
- File watcher in another
- Logs in a third

**Parallel tasks**:
- Running tests while developing
- Building while documenting
- Multiple services (frontend + backend)

**Different contexts**:
- Root vs subdirectory commands
- Different virtual environments
- Separate git operations

### Example: Full-Stack Development

For a full-stack app, create sessions:

1. **"Frontend Dev"**: `cd frontend && npm run dev`
2. **"Backend Dev"**: `cd backend && python manage.py runserver`
3. **"Database"**: `docker-compose up postgres`
4. **"Terminal"**: General commands and git operations

<!-- ![Multiple sessions](./images/sessions-multiple.png) -->
*Organize parallel processes across sessions*

### Session Persistence

**Treq preserves your sessions** across:
- App restarts
- System reboots (session info saved)
- Switching between worktrees

**What's preserved**:
- Session name and metadata
- Working directory
- Terminal scroll-back buffer (last N lines)
- Terminal output history

**What's not preserved**:
- Running processes (you'll need to restart them)
- Shell history (use your shell's history file)
- Active SSH connections

## Terminal Operations

### Basic Terminal Usage

The Treq terminal supports all standard terminal features:

**Text Operations**:
- **Copy**: Select text and press `Cmd+C`
- **Paste**: `Cmd+V`
- **Select All**: `Cmd+A`
- **Clear**: `Cmd+K` or type `clear`

**Search**:
- Press `Cmd+F`
- Type search term
- Use ↑/↓ to navigate matches
- Press `Esc` to close search

**URLs and Paths**:
- Clickable URLs (Cmd+Click to open)
- File paths (if your shell supports it)

### Running Commands

Execute any command you'd run in a regular terminal:

```bash
# Navigate
cd src/components

# Git operations
git status
git add .
git commit -m "Add new feature"

# Package managers
npm install react
pip install django
cargo build --release

# Dev servers
npm run dev
python manage.py runserver
cargo run

# Tests
npm test
pytest
cargo test
```

### Terminal Settings

Customize your terminal experience:

1. Go to Settings → Terminal
2. Configure:
   - **Font family**: Monospace fonts (e.g., "Fira Code", "JetBrains Mono")
   - **Font size**: Comfortable reading size (12-16px)
   - **Default shell**: bash, zsh, fish, or custom path
   - **Scrollback**: Number of lines to keep (default: 1000)

<!-- ![Terminal settings](./images/sessions-settings.png) -->
*Customize terminal appearance and behavior*

## Session Organization Strategies

### Strategy 1: One Session Per Worktree

**Best for**: Simple projects, quick tasks

- Each worktree has exactly one session
- Clear 1:1 mapping
- Minimal switching needed

**Pros**: Simple, easy to manage
**Cons**: May need to stop/start processes frequently

### Strategy 2: Multiple Sessions Per Purpose

**Best for**: Complex projects with many processes

- Create sessions by purpose, not worktree
- Examples: Dev, Test, Build, Logs, Git
- Name sessions clearly

**Pros**: Parallel work, organized by task
**Cons**: More sessions to manage

### Strategy 3: Hybrid Approach

**Best for**: Medium complexity projects

- One main session per worktree for general use
- Additional sessions for long-running processes
- Close extra sessions when done

**Pros**: Flexible, adaptable
**Cons**: Requires discipline to clean up

## Advanced Session Features

### Session Working Directory

Each session has a working directory. To check:

```bash
pwd
```

To change the working directory for current session:

```bash
cd /path/to/different/directory
```

**Note**: The working directory change persists for that session only.

### Session Environment Variables

Set environment variables per-session:

```bash
export NODE_ENV=development
export DEBUG=true
```

These variables persist for the session's lifetime (until you close the terminal).

### Session Initialization

Want commands to run automatically when opening a session?

**Option 1: Shell RC Files**
Add to your `~/.zshrc` or `~/.bashrc`:
```bash
if [[ $PWD == *".treq/worktrees"* ]]; then
    echo "Working in Treq worktree"
    # Your custom initialization
fi
```

**Option 2: Post-Create Commands** (runs once when worktree is created)
- Configure in Settings → Repository
- Example: `npm install && npm run dev`

### Running Background Processes

To run processes in the background:

```bash
# With &
npm run dev &

# Or use nohup
nohup python script.py > output.log 2>&1 &

# Check background jobs
jobs
```

**Best Practice**: Use separate sessions for long-running processes instead of backgrounding.

## Session Cleanup

### Closing Sessions

To close a session:

1. Click the **✕** on the session tab
2. Or right-click and select **"Close Session"**
3. Confirm if processes are running

**What happens**:
- Terminal processes are terminated
- Session removed from sidebar
- Terminal output discarded

### Cleaning Up Old Sessions

Periodically review and close unused sessions:

1. Check session last-active time (hover over tab)
2. Close sessions you're not using
3. Keep only active work sessions

**Disk Space**: Terminal buffers consume minimal space, but closing unused sessions keeps the UI clean.

## Keyboard Shortcuts Reference

### Session Navigation
- `Cmd/Ctrl+1-9`: Switch to session 1-9
- `Cmd/Ctrl+[`: Previous session
- `Cmd/Ctrl+]`: Next session
- `Cmd/Ctrl+W`: Close current session

### Terminal Operations
- `Cmd/Ctrl+C`: Copy selection (or interrupt process)
- `Cmd/Ctrl+V`: Paste
- `Cmd/Ctrl+F`: Find in terminal
- `Cmd/Ctrl+K`: Clear terminal
- `Cmd/Ctrl+L`: Clear scrollback
- `Cmd/Ctrl+Plus/Minus`: Increase/decrease font size

### Quick Actions
- `Cmd/Ctrl+N`: New session for current worktree
- `Cmd/Ctrl+R`: Reload terminal (restart shell)

## Troubleshooting

### Session Not Opening

**Cause**: Shell initialization error or permissions issue.

**Solution**:
1. Check Settings → Terminal → Default Shell path
2. Verify shell exists: `which zsh` or `which bash`
3. Try a different shell temporarily

### Terminal Output Garbled

**Cause**: Terminal state corrupted or escape sequences.

**Solution**:
- Type `reset` and press Enter
- Or close and reopen the session
- Adjust terminal settings if persistent

### Commands Not Working

**Cause**: Wrong working directory or environment.

**Solution**:
- Check `pwd` to verify location
- Verify you're in the worktree directory
- Check environment variables with `env`

### Can't Close Session with Running Process

**Cause**: Confirmation required to avoid losing work.

**Solution**:
- Stop the process first (`Ctrl+C`)
- Or force close in context menu
- Check "Don't ask again" if you want automatic termination

## Best Practices

1. **Name Your Sessions**: Don't rely on auto-generated names
2. **One Long-Running Process Per Session**: Easier to manage and monitor
3. **Close Unused Sessions**: Keep workspace clean
4. **Use Keyboard Shortcuts**: Much faster than clicking
5. **Check Working Directory**: Always verify `pwd` before running commands
6. **Save Important Output**: Copy or redirect to files before closing
7. **Regular Cleanup**: Close sessions when done with worktrees

## Example Workflows

### Frontend Development
```bash
# Session 1: Dev Server
npm run dev

# Session 2: Tests (watch mode)
npm run test:watch

# Session 3: General terminal
# (for git, npm commands, etc.)
```

### Backend API Development
```bash
# Session 1: API Server
python manage.py runserver

# Session 2: Database
docker-compose up db

# Session 3: API Tests
pytest --watch

# Session 4: General
# (for migrations, shell, etc.)
```

### Full-Stack Monorepo
```bash
# Session 1: Frontend
cd apps/web && npm run dev

# Session 2: Backend
cd apps/api && npm run dev

# Session 3: Database
cd infra && docker-compose up

# Session 4: General
# (for linting, commits, etc.)
```

## Next Steps

Now that you can manage terminal sessions:

- [**Executing Implementation Plans**](executing-implementation-plans) - Use AI-powered plans in terminals
- [**Staging and Committing**](staging-and-committing) - Git workflows in sessions
- [**Tips & Tricks**](../tips-and-tricks/customizing-settings) - Customize your workflow
