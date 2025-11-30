---
sidebar_position: 1
---

# Using Treq with a Git Repository

Learn how to set up Treq with your Git repository and understand the relationship between your main repository and worktrees.

This guide covers:
- Setting up Treq with an existing Git repository
- Understanding the main repository vs worktrees
- Configuring repository-specific settings
- Managing the `.treq` folder structure
- Best practices for repository setup

- **Prerequisites**: Treq installed, existing Git repository

## Understanding Treq's Repository Structure

Before diving in, it's important to understand how Treq organizes your repository:

```
your-project/
├── .git/                          # Your main Git repository
├── .treq/                         # Treq's data folder (git-ignored)
│   ├── local.db                   # Treq's SQLite database
│   ├── worktrees/                 # All worktrees stored here
│   │   ├── treq-feature-1/        # First worktree
│   │   ├── treq-bugfix-2/         # Second worktree
│   │   └── ...                    # More worktrees
│   ├── plans/                     # Saved implementation plans
│   └── .gitignore                 # Ensures .treq is ignored
├── src/                           # Your source code (main branch)
├── package.json                   # Your project files
└── ...
```

**Key Points**:
- Your **main repository** remains untouched in the root directory
- All **worktrees** live in `.treq/worktrees/`
- Treq's **metadata** is stored in `.treq/local.db`
- The `.treq` folder is automatically added to `.gitignore`

## Step 1: Select Your Repository

When you first open Treq (or click "Select Repository"):

<!-- ![Select repository](./images/repo-select-dialog.png) -->
*Navigate to your Git repository root folder*

1. Click **"Select Repository"** or the folder icon
2. Navigate to your project directory
3. Select the folder containing `.git`
4. Click **"Open"**

**What happens next?**
Treq will:
- Verify it's a valid Git repository
- Create the `.treq/` folder structure
- Add `.treq/` to your `.gitignore` (if not already there)
- Initialize the local database
- Scan for existing worktrees
- Display the dashboard

### If `.treq` Already Exists

If you've used Treq with this repository before:
- Treq loads existing worktrees from the database
- Terminal sessions are restored
- Your settings are preserved

## Step 2: Initial Repository Configuration

After selecting a repository, configure it in Settings:

1. Press `Cmd+,` (macOS) / `Ctrl+,` (Windows/Linux) to open Settings
2. Go to **"Repository Settings"** tab

<!-- ![Repository settings](./images/repo-settings.png) -->
*Repository-specific settings for worktree management*

### Key Settings to Configure

**Branch Naming Pattern**:
- Default: `treq/{name}`
- Customizable pattern for all new worktrees
- The `{name}` placeholder is replaced with your branch name
- Examples:
  - `feature/{name}` → creates branches like `feature/user-auth`
  - `{name}` → creates branches without prefix

**Post-Create Commands**:
- Commands to run automatically after creating each worktree
- Useful for dependency installation or environment setup
- Examples:
  - `npm install` for Node.js projects
  - `python -m venv .venv && source .venv/bin/activate` for Python
  - `cargo build` for Rust projects

**Working Directory**:
- Shows current repository path
- Click "Change" to switch to a different repository

## Step 3: Understanding Main Repository vs Worktrees

### The Main Repository

Your **main repository** is:
- The original Git directory where you first cloned/initialized
- Located at the root of your project
- Contains your default branch (usually `main` or `master`)
- Visible in Treq's dashboard on the left side

**Main Repository Features in Treq**:
- View uncommitted changes
- Stage and commit files
- Push/pull from remote
- Access via optional "Main" terminal session

**When to use the main repository**:
- Quick fixes that don't need a separate worktree
- Merging worktrees back into main
- Pulling latest updates from remote

### Worktrees

**Worktrees** are:
- Separate working directories linked to the same Git repository
- Each worktree has its own checked-out branch
- All worktrees share the same `.git` directory
- Independent working states (staged files, uncommitted changes)

**Worktree Features in Treq**:
- Visual worktree cards in dashboard
- Dedicated terminal sessions
- Independent staging areas
- Per-worktree metadata (plan titles, descriptions)

**When to create worktrees**:
- Working on new features in parallel
- Applying hotfixes while keeping main work untouched
- Reviewing pull requests
- Testing different implementations side-by-side

## Step 4: Checking Repository Status

After setup, verify everything is working:

<!-- ![Repository dashboard](./images/repo-dashboard-status.png) -->
*Dashboard shows repository health and status*

**Check These Indicators**:

1. **Current Branch** (main repo section):
   - Shows which branch your main repo is on
   - Displays sync status with remote

2. **Remote Connection**:
   - Green indicator: Connected to remote
   - Orange: Remote configured but not fetched
   - Red: No remote configured

3. **Repository Health**:
   - No errors or warnings
   - `.treq` folder created successfully
   - Git operations working correctly

### Testing Git Operations

Run a quick test to ensure Treq can execute Git commands:

1. Create a test worktree (see [Your First Worktree](../getting-started/your-first-worktree))
2. Make a change in the terminal
3. Verify Treq detects the change
4. Stage and commit the change

If all steps work, Treq is properly configured!

## Step 5: Git Configuration Best Practices

### Remote Configuration

Ensure your repository has a remote configured:

```bash
git remote -v
```

If you don't see a remote:

```bash
git remote add origin https://github.com/yourusername/your-repo.git
```

**Why this matters**: Treq uses remote information to:
- Show ahead/behind commit indicators
- Enable push/pull operations
- Track remote branches for worktree creation

### Git Ignore Setup

Treq automatically adds `.treq/` to your `.gitignore`. Verify this:

```bash
cat .gitignore | grep ".treq"
```

If missing, add it manually:

```bash
echo ".treq/" >> .gitignore
git add .gitignore
git commit -m "chore: ignore treq folder"
```

**Important**: Never commit the `.treq` folder! It contains:
- Local database with machine-specific paths
- Terminal session history
- Local metadata not meant for sharing

### Authentication Setup

For push/pull operations, ensure Git authentication is configured:

**HTTPS**:
```bash
git config credential.helper store
# Or use OS keychain
git config credential.helper osxkeychain  # macOS
git config credential.helper manager      # Windows
```

**SSH**:
```bash
ssh-add ~/.ssh/id_rsa
# Verify connection
ssh -T git@github.com
```

Treq uses your system's Git configuration for authentication.

## Step 6: Understanding Repository Scope

### Single Repository Mode

Treq works with **one repository at a time**. To work with multiple repositories:

1. Close current repository (Dashboard → "Close Repository")
2. Select a different repository
3. Each repository has its own:
   - Worktrees
   - Sessions
   - Settings
   - Database

### Switching Repositories

To switch between repositories:

**Method 1**: Use the folder icon
- Click the folder icon in the top-left
- Select a different repository
- Treq loads that repository's worktrees

**Method 2**: Recent Repositories
- File → Recent Repositories (coming soon)
- Quick access to previously opened repos

## Repository Maintenance

### Rebuilding Worktree Database

If Treq loses track of worktrees (rare):

1. Go to Settings → Repository
2. Click **"Rebuild Worktrees Database"**
3. Treq scans `.treq/worktrees/` and recreates entries

**When to rebuild**:
- After manually moving worktree folders
- Database corruption (very rare)
- Worktrees not appearing in dashboard

### Cleaning Up Old Worktrees

Remove worktrees you're no longer using:

1. Ensure all work is committed or saved
2. Click **"Delete"** on the worktree card
3. Treq removes the worktree directory and database entry

**Disk Space**: Each worktree duplicates your repository's files. Clean up regularly to save space.

### Viewing Repository Size

Check your repository's disk usage in Settings:

- Settings → Repository → "Repository Size"
- Shows total size including all worktrees
- Helpful for monitoring disk usage

## Working with Large Repositories

For repositories over 1GB:

### Performance Tips

1. **Sparse Checkout** (for worktrees):
   - Only checkout files you need
   - Reduces initial worktree creation time

2. **Shallow Clones**:
   - Use `--depth 1` when cloning
   - Reduces repository size

3. **Git LFS**:
   - Store large files externally
   - Treq supports Git LFS transparently

### Excluding Files

Add patterns to `.gitignore` for:
- Build artifacts (`dist/`, `build/`)
- Dependencies (`node_modules/`, `venv/`)
- Large media files

This speeds up Treq's file watching and reduces worktree sizes.

## Team Collaboration

### Sharing Worktree Workflows

While `.treq` itself isn't shared, you can share:

**Branch Naming Conventions**:
- Team agrees on pattern (e.g., `feature/{name}`)
- Everyone sets the same pattern in Settings

**Post-Create Commands**:
- Document standard commands in README
- Team members configure locally

**Implementation Plans**:
- Plans can be exported as files
- Share via git (in a separate `docs/plans/` folder)

### Multiple Users on Same Repo

Each developer has their own:
- `.treq` folder (git-ignored)
- Local database
- Worktree instances

This means:
- No conflicts between team members
- Each person's worktrees are independent
- Share work via git branches (normal workflow)

## Common Repository Patterns

### Feature Branch Workflow

1. Main repo stays on `main` branch
2. Create worktrees for each feature
3. Develop in worktrees independently
4. Merge back to main when ready

### Gitflow Workflow

1. Main repo on `develop` branch
2. Feature worktrees branch from `develop`
3. Use branch naming: `feature/{name}`
4. Merge features into develop worktree

### Trunk-Based Development

1. Main repo on `main`/`trunk` branch
2. Short-lived feature worktrees
3. Merge quickly (daily or more)
4. Clean up worktrees frequently

## Troubleshooting

### "Not a valid Git repository"

**Cause**: Selected folder doesn't contain `.git`.

**Solution**:
- Ensure you're in the repository root
- Initialize if needed: `git init`
- Clone repository if not local: `git clone <url>`

### "Unable to create .treq folder"

**Cause**: Permission issues or disk space.

**Solution**:
- Check folder permissions
- Ensure sufficient disk space
- Run Treq with appropriate permissions

### Worktrees Not Syncing

**Cause**: Database out of sync with filesystem.

**Solution**:
- Use "Rebuild Worktrees Database" in Settings
- Or manually delete `.treq/local.db` (Treq will recreate)

## Next Steps

Now that your repository is set up:

- [**Creating Terminal Sessions**](creating-terminal-sessions) - Work with terminals
- [**Creating Worktrees**](../common-tasks/creating-worktrees) - Detailed worktree guide
- [**Staging and Committing**](staging-and-committing) - Manage your changes
