---
sidebar_position: 1
---

# Using Treq with a Git Repository

_How to set up Treq with your repository and understand the relationship between your repository and Treq workspaces._

Treq works with Git repositories and uses [Jujutsu](https://jj-vcs.github.io/jj/latest/) under the hood for core functionality. When you select a repository, Treq creates a `.treq/` folder to store workspaces, plans, and local metadata. Treq also initializes `.jj/` for Jujutsu metadata. Both folders are automatically added to `.gitignore` so they're never committed.

## Repository Structure

```text
your-project/
├── .git/                    # Your Git repository
├── .jj/                     # Jujutsu metadata (git-ignored)
├── .treq/                   # Treq's data (git-ignored)
│   ├── workspaces/           # All workspaces stored here
│   │   ├── treq-feature-1/
│   │   └── treq-bugfix-2/
│   └── plans/               # Saved implementation plans
├── src/                     # Your source code
└── ...
```

Your selected repository stays at the root. All workspaces live in `.treq/workspaces/`, each checking out a different branch while sharing the same repository history.

## Repository vs Workspaces

The **repository** is your original directory. Use it for quick fixes, merging workspaces back, and pulling remote updates. It appears on the left side of the dashboard.

**Workspaces** are separate working directories linked to the same repository. Each has its own branch and independent working tree. Create workspaces for features, bug fixes, PR reviews, or testing different implementations side-by-side. They appear as cards on the right side of the dashboard.

## Git Configuration

Ensure your repository has a remote configured for push/pull operations and commit tracking:

```bash
git remote -v
# If missing:
git remote add origin https://github.com/user/repo.git
```

Treq uses your system's Git authentication. Configure credential helpers for HTTPS or add SSH keys as you normally would.

## Large Repositories

For repositories over 1GB, consider sparse checkout for workspaces (only checkout needed files), shallow clones (`--depth 1`), or Git LFS for large binaries. Add build artifacts and dependencies (`dist/`, `node_modules/`, `venv/`) to `.gitignore` to speed up file watching and reduce workspace sizes.

## Switching Repositories

Treq works with one repository at a time. To switch, click the folder icon and select a different repository. Each repository has its own workspaces, sessions, and settings stored in its `.treq/` folder.

## Maintenance

If workspaces aren't appearing correctly, use Settings → Repository → **Rebuild Workspaces Database** to rescan `.treq/workspaces/`. Delete unused workspaces regularly to save disk space. Each duplicates your repository's files.
