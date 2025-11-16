# Treq - Git Worktree Manager

A modern desktop application for managing Git worktrees with integrated terminal, diff viewer, and AI editor launcher support.

## Features

### Core Functionality
- **Git Worktree Management**: Create, list, and delete Git worktrees through an intuitive UI
- **Real-time Status**: Monitor branch status, commits ahead/behind, and file changes
- **Integrated Terminal**: Full-featured terminal with PTY support for each worktree
- **Diff Viewer**: Built-in Monaco Editor for viewing file diffs
- **AI Editor Launcher**: Quick launch Cursor, VS Code, Claude, or Aider in your worktrees
- **Persistent Storage**: SQLite database for tracking worktrees and command history

### Technical Stack

#### Backend (Rust/Tauri)
- **Database**: SQLite with rusqlite for persistent storage
- **Git Operations**: Native git CLI integration for worktree operations
- **PTY Support**: portable-pty for terminal emulation
- **File System**: File watching and directory operations

#### Frontend (React/TypeScript)
- **UI Framework**: React 18 with TypeScript
- **Styling**: Tailwind CSS with custom design system
- **Components**: shadcn/ui-inspired component library
- **State Management**: TanStack Query for server state
- **Terminal**: xterm.js with fit and web-links addons
- **Code Editor**: Monaco Editor for diff viewing
- **Icons**: Lucide React

## Project Structure

```
treq/
├── src/                          # Frontend source
│   ├── components/
│   │   ├── ui/                   # Base UI components
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── input.tsx
│   │   │   └── label.tsx
│   │   ├── Dashboard.tsx         # Main dashboard view
│   │   ├── WorktreeCard.tsx      # Worktree display card
│   │   ├── CreateWorktreeDialog.tsx
│   │   ├── Terminal.tsx          # Terminal component
│   │   ├── DiffViewer.tsx        # Diff viewer with Monaco
│   │   └── EditorLauncher.tsx    # AI editor launcher
│   ├── lib/
│   │   ├── api.ts               # Tauri command wrappers
│   │   └── utils.ts             # Utility functions
│   ├── App.tsx                  # Root component
│   ├── main.tsx                 # Entry point
│   └── index.css                # Global styles
├── src-tauri/                   # Rust backend
│   ├── src/
│   │   ├── db.rs               # Database operations
│   │   ├── git.rs              # Git worktree operations
│   │   ├── pty.rs              # PTY/terminal support
│   │   ├── lib.rs              # Main Tauri app & commands
│   │   └── main.rs             # Binary entry point
│   └── Cargo.toml              # Rust dependencies
├── package.json                # Node dependencies
├── tailwind.config.js          # Tailwind configuration
├── vite.config.ts              # Vite build config
└── README.md                   # This file
```

## Installation & Setup

### Prerequisites
- Node.js (v18 or higher)
- Rust (latest stable)
- Git

### Development

1. **Clone the repository**:
   ```bash
   git clone <your-repo-url>
   cd treq
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run in development mode**:
   ```bash
   npm run tauri dev
   ```

### Building for Production

```bash
npm run tauri build
```

The compiled application will be available in `src-tauri/target/release`.

## Usage

### First Time Setup
1. Launch the application
2. Click the Settings icon (gear) in the top right
3. Set your main repository path
4. Click "Save"

### Creating a Worktree
1. Click "New Worktree" button
2. Enter branch name (or select existing)
3. Check "Create new branch" if creating a new branch
4. Specify the worktree path
5. Optionally add a post-create command (e.g., `npm install`)
6. Click "Create Worktree"

### Working with Worktrees
Each worktree card displays:
- Branch name
- Worktree path
- Commits ahead/behind main
- File change status (modified, added, deleted, untracked)

Actions available:
- **Editor**: Launch in Cursor, VS Code, Claude, or Aider
- **Terminal**: Open integrated terminal in the worktree directory
- **Diff**: View file differences in Monaco Editor
- **Open**: Open worktree directory in file manager
- **Delete**: Remove worktree (with confirmation)

### Terminal Features
- Full PTY support with shell integration
- Working directory set to worktree path
- Command history and input
- Resizable and scrollable

### Diff Viewer
- File tree navigation
- Syntax-highlighted diff view
- Unified diff format
- Read-only Monaco Editor

## Database Schema

### worktrees
- `id`: INTEGER PRIMARY KEY
- `repo_path`: TEXT (main repository path)
- `worktree_path`: TEXT (worktree location)
- `branch_name`: TEXT
- `created_at`: TEXT (ISO 8601 timestamp)
- `metadata`: TEXT (JSON, optional)

### commands
- `id`: INTEGER PRIMARY KEY
- `worktree_id`: INTEGER (foreign key)
- `command`: TEXT
- `created_at`: TEXT (ISO 8601 timestamp)
- `status`: TEXT
- `output`: TEXT (optional)

### settings
- `key`: TEXT PRIMARY KEY
- `value`: TEXT

## API Reference

### Database Commands
- `get_worktrees()`: Fetch all worktrees
- `add_worktree_to_db(...)`: Add worktree to database
- `delete_worktree_from_db(id)`: Delete worktree by ID
- `get_commands(worktree_id)`: Get commands for worktree
- `add_command(...)`: Log a command execution
- `get_setting(key)`: Get setting value
- `set_setting(key, value)`: Save setting

### Git Commands
- `git_create_worktree(...)`: Create new worktree
- `git_list_worktrees(repo_path)`: List all worktrees
- `git_remove_worktree(...)`: Remove worktree
- `git_get_status(worktree_path)`: Get git status
- `git_get_branch_info(...)`: Get branch ahead/behind info
- `git_get_file_diff(...)`: Get diff for specific file
- `git_list_branches(repo_path)`: List all branches

### PTY Commands
- `pty_create_session(...)`: Create terminal session
- `pty_write(session_id, data)`: Write to terminal
- `pty_resize(session_id, rows, cols)`: Resize terminal
- `pty_close(session_id)`: Close terminal session

### File System Commands
- `read_file(path)`: Read file contents
- `list_directory(path)`: List directory contents

## Configuration

### Customizing Shell
The terminal uses your system's default shell:
- macOS/Linux: `$SHELL` environment variable
- Windows: PowerShell

### Theme
The app supports light and dark modes based on system preferences. Customize colors in `src/index.css`.

## Troubleshooting

### Git Commands Failing
Ensure git is installed and available in your PATH:
```bash
git --version
```

### Terminal Not Working
Check that your shell is properly configured and accessible.

### Database Issues
The database is stored in the application data directory:
- macOS: `~/Library/Application Support/com.treq.app/treq.db`
- Linux: `~/.local/share/com.treq.app/treq.db`
- Windows: `%APPDATA%/com.treq.app/treq.db`

You can delete this file to reset the application state.

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## Future Enhancements

- [ ] Branch switching in existing worktrees
- [ ] Custom shell commands per worktree
- [ ] Git commit/push integration
- [ ] Multiple repository support
- [ ] Keyboard shortcuts
- [ ] Search and filter worktrees
- [ ] Export/import worktree configurations
- [ ] Integration with GitHub/GitLab
- [ ] Worktree templates
- [ ] Custom themes

## License

MIT License - See LICENSE file for details

## Credits

Built with:
- [Tauri](https://tauri.app/) - Desktop app framework
- [React](https://react.dev/) - UI library
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [xterm.js](https://xtermjs.org/) - Terminal emulator
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - Code editor
- [TanStack Query](https://tanstack.com/query) - Data fetching
- [Lucide](https://lucide.dev/) - Icons
