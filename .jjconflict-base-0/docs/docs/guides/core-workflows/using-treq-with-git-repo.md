---
sidebar_position: 1
---

# Using Treq with a Git Repository

_How to set up Treq with your repository and understand the relationship between main and worktrees._

Treq works with one Git repository at a time. When you select a repository, Treq creates a `.treq/` folder to store worktrees, plans, and local metadata. This folder is automatically added to `.gitignore` so it's never committed.

## Repository Structure

```
your-project/
├── .git/                    # Your Git repository
├── .treq/                   # Treq's data (git-ignored)
│   ├── worktrees/           # All worktrees stored here
│   │   ├── treq-feature-1/
│   │   └── treq-bugfix-2/
│   └── plans/               # Saved implementation plans
├── src/                     # Your source code (main branch)
└── ...
```

Your main repository remains untouched at the root. All worktrees live in `.treq/worktrees/`, each checking out a different branch while sharing the same `.git` directory.

## Setting Up

Click **Select Repository** or the folder icon, navigate to your project's root (the folder containing `.git`), and open it. Treq verifies it's a valid Git repository, creates the `.treq/` structure, scans for existing worktrees, and displays the dashboard.

Configure repository-specific settings in Settings → Repository Settings. Set your **branch naming pattern** (e.g., `treq/{name}` or `feature/{name}`) and **post-create commands** (e.g., `npm install` or `pip install -r requirements.txt`) to run automatically after creating worktrees.

## Main Repository vs Worktrees

The **main repository** is your original directory containing the default branch (usually `main`). Use it for quick fixes, merging worktrees back, and pulling remote updates. It appears on the left side of the dashboard.

**Worktrees** are separate working directories linked to the same repository. Each has its own branch and independent staging area. Create worktrees for features, bug fixes, PR reviews, or testing different implementations side-by-side. They appear as cards on the right side of the dashboard.

## Git Configuration

Ensure your repository has a remote configured for push/pull operations and commit tracking:

```bash
git remote -v
# If missing:
git remote add origin https://github.com/user/repo.git
```

Treq uses your system's Git authentication—configure credential helpers for HTTPS or add SSH keys as you normally would.

## Large Repositories

For repositories over 1GB, consider using sparse checkout for worktrees (only checkout needed files), shallow clones (`--depth 1`), or Git LFS for large binaries. Add build artifacts and dependencies (`dist/`, `node_modules/`, `venv/`) to `.gitignore` to speed up file watching and reduce worktree sizes.

## Switching Repositories

Treq works with one repository at a time. To switch, click the folder icon and select a different repository. Each repository has its own worktrees, sessions, and settings stored in its `.treq/` folder.

## Maintenance

If worktrees aren't appearing correctly, use Settings → Repository → **Rebuild Worktrees Database** to rescan `.treq/worktrees/`. Delete unused worktrees regularly to save disk space—each duplicates your repository's files.

## Next Steps

- [Creating Terminal Sessions](creating-terminal-sessions) — Work with terminals
- [Your First Worktree](../getting-started/your-first-worktree) — Create a worktree
- [Staging and Committing](staging-and-committing) — Manage changes
