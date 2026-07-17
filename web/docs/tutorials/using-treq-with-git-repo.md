---
sidebar_position: 1
---

# Using Treq with a Git Repository

_How to set up Treq with your Git repository and understand the relationship between the repo and Treq workspaces._

Treq works with Git repositories. You select a repository, create workspaces for parallel work, and continue using Git remotes for fetch and push. You do not need to know [Jujutsu](https://jj-vcs.github.io/jj/latest/) to work with Treq.

When you open a repository, Treq creates a `.treq/` folder for workspaces and local metadata. It also initializes colocated `.jj/` state. Both folders are added to `.gitignore` so they are never committed.

Colocation is the under-the-hood implementation. It lets Treq rebase workspace branches when targets move, which Git worktrees cannot do. Treq runs those Git and Jujutsu operations for you. Dropping to the `jj` CLI is a power-user option and is not recommended for normal use.

## Repository Structure

```text
your-project/
├── .git/                    # Your Git repository (native VCS)
├── .jj/                     # Colocated Jujutsu state (managed by Treq, git-ignored)
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

## Why Treq Uses Jujutsu

Git remains the VCS you authenticate to remotes with and the identity of the repository you open. Jujutsu sits beside Git in colocated mode so Treq can update dependent workspace branches automatically when a target moves.

That automatic rebase is the product reason for Jujutsu. Stay in Treq for workspace create, commit, stack update, merge, and sync. Use Git in the terminal when you need familiar commands against the working copy. Reserve `jj` for intentional debugging only.

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
