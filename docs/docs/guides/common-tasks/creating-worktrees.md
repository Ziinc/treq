---
sidebar_position: 1
---

# Creating Worktrees

A detailed guide to creating worktrees with all available options and best practices.

- All methods for creating worktrees
- Branch naming and patterns
- Post-create commands setup
- Worktree metadata and organization
- Advanced creation options

## Quick Creation

### Method 1: Dashboard Button

1. Click **"New Worktree"** in dashboard
2. Enter branch name or intent
3. Click **"Create"**

### Method 2: Keyboard Shortcut

Press `Cmd+N` / `Ctrl+N` from anywhere

### Method 3: Command Palette

1. Press `Cmd+K` / `Ctrl+K`
2. Type "new worktree"
3. Press Enter

## The Create Worktree Dialog

<!-- ![Create worktree dialog](./images/create-dialog.png) -->
*The dialog provides options for customizing worktree creation*

### Branch Options

**Create New Branch**:
- Enter branch name or intent
- Treq applies naming pattern
- Creates branch from base

**From Existing Branch**:
- Dropdown shows all branches
- Local and remote branches
- Select to checkout existing

### Branch Naming Patterns

Configured in Settings → Repository → Branch Pattern

**Default**: `treq/{name}`

**Examples**:
- Input: `add-auth` → Branch: `treq/add-auth`
- Input: `fix login bug` → Branch: `treq/fix-login-bug`

**Custom patterns**:
- `feature/{name}` → `feature/add-auth`
- `{name}` → `add-auth` (no prefix)
- `dev/{name}` → `dev/add-auth`

### Base Branch Selection

**Base branch**: Where your new branch starts from

**Common choices**:
- `main` - Production branch
- `develop` - Integration branch
- `staging` - Staging environment

**Divergence**: Shows commits ahead/behind

### Plan Title (Optional)

Add a descriptive title:
- "Add user authentication with JWT"
- "Fix memory leak in file processor"
- "Refactor API error handling"

**Purpose**: Helps remember what you're working on

## Post-Create Commands

### Configuring Commands

Settings → Repository → Post-Create Commands

**Common examples**:

**Node.js**:
```bash
npm install
```

**Python**:
```bash
python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
```

**Rust**:
```bash
cargo build
```

**Multiple commands**:
```bash
npm install && npm run build && npm run dev &
```

### Disabling for Single Creation

Uncheck "Run post-create commands" in dialog

## Advanced Options

### Working Directory

- Default: `.treq/worktrees/{branch-name}`
- Custom paths not recommended (breaks assumptions)

### Metadata

Additional metadata stored:
- Creation timestamp
- User intent/description
- Associated plan (if created from plan)
- Tags (optional)

## Creating from Remote Branches

To work on teammate's branch:

1. Fetch latest: `git fetch origin`
2. New Worktree → From Existing
3. Select `origin/their-branch`
4. Creates local tracking branch

## Best Practices

1. **Meaningful Names**: Use descriptive branch names
2. **Consistent Patterns**: Stick to team conventions
3. **Clean Up**: Delete worktrees when done
4. **One Purpose**: Each worktree for one feature/fix
5. **Plan Titles**: Add context for future you

## Troubleshooting

**"Branch already exists"**: Choose different name or select existing branch
**Post-create failed**: Check commands are valid, worktree still created
**Creation slow**: Large repos take time, be patient

## Next Steps

- [Creating Terminal Sessions](../core-workflows/creating-terminal-sessions)
- [Staging and Committing](../core-workflows/staging-and-committing)
