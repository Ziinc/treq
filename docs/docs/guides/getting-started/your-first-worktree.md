---
sidebar_position: 2
---

# Your First Worktree

Create your first Git worktree with Treq in just 5 minutes! This quick-start tutorial will get you productive immediately.

By the end of this guide, you'll know how to:
- Create a new worktree from the dashboard
- Understand worktree status indicators
- Open a terminal session in your worktree
- Make changes and see them reflected in Treq

- **Prerequisites**: Treq installed and a Git repository selected

## Step 1: Open Your Repository in Treq

If you haven't already, launch Treq and select a Git repository:

1. Click **Select Repository** or use the folder icon
2. Navigate to your Git repository
3. Select the folder containing `.git`

You should see the Treq dashboard with your repository information.

<!-- ![Treq dashboard](./images/first-worktree-dashboard.png) -->
*The dashboard shows your main repository and existing worktrees*

## Step 2: Click "New Worktree"

In the upper right corner of the dashboard, you'll see a **"New Worktree"** button.

1. Click **"New Worktree"** (or press `Cmd+N` / `Ctrl+N`)
2. The "Create Worktree" dialog will open

<!-- ![Create worktree dialog](./images/first-worktree-create-dialog.png) -->
*The create worktree dialog lets you specify branch details*

## Step 3: Name Your Branch

You'll see two options for creating a worktree:

### Option A: Create from Existing Branch

Select an existing branch from the dropdown if you want to work on code that already exists in your repository.

**Example**: Select `develop` or `feature/authentication` if those branches already exist.

### Option B: Create New Branch (Recommended for First Time)

Let's create a new branch for a feature:

1. Select **"Create new branch"**
2. Enter a branch name or intent, for example: `add-user-profile`
3. Treq will automatically format it based on your branch pattern (default: `treq/add-user-profile`)

**What's happening?** Treq uses your configured branch naming pattern (set in Settings) to standardize branch names. The default pattern is `treq/{name}`.

## Step 4: Configure Options (Optional)

Before creating the worktree, you can customize:

**Base Branch**:
- Choose which branch to branch from (default: `main` or `master`)
- Example: Branch from `develop` if that's your integration branch

**Plan Title**:
- Add a descriptive title for this work (optional)
- Example: "Add user profile page with avatar upload"
- This helps you remember what you're working on

**Post-Create Commands**:
- Commands to run automatically after creation
- Example: `npm install` for Node.js projects
- These can be set as defaults in Settings

For now, you can leave these as defaults.

## Step 5: Create the Worktree

1. Click **"Create Worktree"**
2. Wait a moment while Treq:
   - Runs `git worktree add -b treq/add-user-profile .treq/worktrees/treq-add-user-profile`
   - Creates the worktree directory
   - Saves metadata to the database
   - Runs post-create commands (if configured)

<!-- ![Creating worktree progress](./images/first-worktree-creating.png) -->
*Treq shows progress while creating the worktree*

## Step 6: Explore Your New Worktree

After creation, you'll see a new worktree card in the dashboard:

<!-- ![Worktree card](./images/first-worktree-card.png) -->
*Each worktree has its own card showing status and actions*

**Understanding the Worktree Card**:

- **Branch name**: `treq/add-user-profile`
- **Status indicators**:
  - 🟢 **Up to date**: No commits ahead or behind
  - 📊 **Divergence**: Shows commits ahead/behind base branch
  - 📁 **Path**: Location on disk (hover to see full path)
- **Actions**:
  - **Open**: Open terminal session for this worktree
  - **Merge**: Merge this worktree into another branch
  - **Delete**: Remove the worktree (after work is done)

## Step 7: Open a Terminal Session

Now let's work in your new worktree:

1. Click **"Open"** on the worktree card
2. A terminal session opens in the left sidebar
3. The terminal's working directory is set to your worktree path

<!-- ![Terminal session](./images/first-worktree-terminal.png) -->
*The terminal session is ready for commands in your worktree directory*

**What's happening?** Treq creates a PTY (pseudo-terminal) session with:
- Working directory: `.treq/worktrees/treq-add-user-profile`
- Full shell environment (bash, zsh, or your configured shell)
- Session persistence (output saved even when you switch views)

## Step 8: Make Your First Change

Let's make a simple change to verify everything works:

1. In the terminal, check your current branch:
   ```bash
   git branch
   ```
   You should see `* treq/add-user-profile`

2. Create or edit a file:
   ```bash
   echo "# User Profile Feature" > FEATURE.md
   git status
   ```

3. Notice Treq automatically detects the change!

## Step 9: View Your Changes

Return to the dashboard view:

1. Click **"Dashboard"** in the left sidebar (or press `Cmd+D` / `Ctrl+D`)
2. Your worktree card now shows **"1 file changed"**

<!-- ![Worktree with changes](./images/first-worktree-changes.png) -->
*The worktree card updates to show uncommitted changes*

## Understanding Worktree Status

Your worktree card displays several important indicators:

**Commit Status**:
- **↑2 ↓0**: 2 commits ahead, 0 behind base branch
- **Synced**: Up to date with remote
- **Changes**: Uncommitted file changes present

**Actions Available**:
- **View Changes**: Open the diff viewer to see what changed
- **Open Terminal**: Open or switch to this worktree's terminal
- **Merge**: Merge back to main when ready
- **Push**: Push commits to remote repository

## What Just Happened?

Congratulations! You've created your first worktree. Let's recap what Treq did:

1. **Created Git Worktree**: Ran `git worktree add` to create a new worktree
2. **Set Up Directory**: Created `.treq/worktrees/treq-add-user-profile/`
3. **Stored Metadata**: Saved worktree info to Treq's database
4. **Created Session**: Initialized a persistent terminal session
5. **Monitored Changes**: Started watching for file changes

## Next Steps

Now that you have a worktree, here's what you can do:

### Option 1: Continue Developing
- Make more changes in the terminal
- Use your favorite editor to work on files
- See changes reflected in Treq automatically

### Option 2: Learn About Staging and Committing
- [**Staging and Committing**](../core-workflows/staging-and-committing) - Learn to stage files and create commits

### Option 3: Explore the Interface
- [**Interface Overview**](interface-overview) - Understand all the UI elements

### Option 4: Learn About Merging
- [**Merging Worktrees**](../core-workflows/merging-worktrees) - Merge your work back to main

## Common Questions

**Q: Where is my worktree stored?**
A: By default, in `.treq/worktrees/{branch-name}/` relative to your repository root.

**Q: Can I use my regular editor?**
A: Yes! Your worktree is a regular directory. Open it in VS Code, Cursor, or any editor.

**Q: What happens to my main branch?**
A: Nothing! Your main branch stays untouched. That's the beauty of worktrees.

**Q: Can I create multiple worktrees?**
A: Absolutely! Create as many as you need for different features or bugs.

**Q: How do I delete a worktree?**
A: Click the delete button on the worktree card (after committing or discarding changes).

## Troubleshooting

### "Branch already exists" Error

**Cause**: A branch with that name already exists in your repository.

**Solution**:
- Choose a different branch name
- Or select the existing branch from the dropdown

### Worktree Not Appearing

**Cause**: The worktree was created but Treq didn't detect it.

**Solution**:
- Refresh the dashboard (`Cmd+R` / `Ctrl+R`)
- Check if the directory exists in `.treq/worktrees/`
- Use "Rebuild Worktrees" in Settings if needed

### Post-Create Command Failed

**Cause**: The command you specified (e.g., `npm install`) failed.

**Solution**:
- Check the terminal output for errors
- The worktree is still created and usable
- You can run the command manually in the terminal

## Practice Exercise

Try creating a second worktree for a different feature:

1. Click **"New Worktree"** again
2. Name it something different: `fix-login-bug`
3. Create it
4. Notice both worktrees are now visible on the dashboard
5. Switch between their terminal sessions

You're now working on two branches simultaneously! 🎉

## Next Guide

Ready to dive deeper? Continue to:

- [**Interface Overview**](interface-overview) - Master the Treq interface
- [**Core Workflows**](../core-workflows/using-treq-with-git-repo) - Learn essential workflows
