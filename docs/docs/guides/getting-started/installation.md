---
sidebar_position: 1
---

# Installation

_Get Treq installed and ready to use._

Download the latest version for your platform from the [GitHub Releases page](https://github.com/anthropics/treq/releases).

## First Launch

**macOS**: If Gatekeeper blocks the app, go to System Settings → Privacy & Security, find the Treq message, and click "Open Anyway." Alternatively, right-click Treq in Finder and select Open.

**Linux**: No special steps. Launch from your application menu or run `treq` from the terminal. For AppImage, ensure it's executable (`chmod +x`).

**Windows**: If SmartScreen blocks the app, click "More info" then "Run anyway." Treq is code-signed but newer applications may trigger SmartScreen until they build reputation.

## Initial Setup

Click **Select Repository** or the folder icon, navigate to a Git repository, and select the folder containing `.git`. Treq verifies the repository, checks for existing worktrees, and initializes the `.treq` folder for metadata.

Optionally configure settings through the gear icon: branch naming pattern, post-create commands (like `npm install`), and terminal preferences. You can change these anytime.

## Updating

Treq checks for updates automatically. Manual check: **Treq → Check for Updates** (macOS/Linux) or **Help → Check for Updates** (Windows).

## Troubleshooting

**"Git not found"**: Verify Git is installed (`git --version`). Ensure it's in your PATH—restart Terminal after installing Git on macOS, or reinstall Git with "Add to PATH" on Windows.

**"Invalid Git Repository"**: Ensure the folder contains a `.git` subdirectory. Initialize with `git init` if needed, and select the repository root, not a subdirectory.

**App won't open**: See First Launch section for platform-specific security settings. On Linux, ensure FUSE is installed for AppImage.

## Uninstalling

**macOS**: Drag Treq from Applications to Trash. Remove config: `rm -rf ~/.treq`

**Linux**: Use your package manager (`dpkg -r treq`, `rpm -e treq`) or delete the AppImage. Remove config: `rm -rf ~/.config/treq`

**Windows**: Use "Add or Remove Programs" in Settings. Config is stored in `%APPDATA%\treq`

## Next Steps

- [Creating Worktrees](your-first-worktree) — Create your first worktree
- [Interface Overview](interface-overview) — Learn the UI
