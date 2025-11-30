---
sidebar_position: 1
---

# Installation

Get Treq installed on your system and ready to use.

Learn how to download, install, and set up Treq on macOS, Linux, or Windows.

## Download Treq

Download the latest version of Treq for your platform from the [GitHub Releases page](https://github.com/yourusername/treq/releases).

## First Launch

### macOS

When you first open Treq on macOS, you may see a security warning:

<!-- ![macOS security warning](./images/installation-macos-security.png) -->
*macOS Gatekeeper may block apps from unidentified developers*

**To allow Treq**:
1. Go to **System Settings** → **Privacy & Security**
2. Find the message about Treq being blocked
3. Click **Open Anyway**
4. Confirm by clicking **Open**

Alternatively, right-click on Treq in Finder and select **Open**.

### Linux

No special steps required. Launch from your application menu or run `treq` from the terminal.

### Windows

If Windows SmartScreen blocks Treq:
1. Click **More info**
2. Click **Run anyway**

Treq is code-signed, but newer applications may trigger SmartScreen until they build reputation.

## Initial Setup

When you first launch Treq, you'll see the welcome screen:

<!-- ![Treq welcome screen](./images/installation-welcome-screen.png) -->
*The welcome screen guides you through initial configuration*

### Step 1: Select a Repository

1. Click **Select Repository** or use the folder icon
2. Navigate to an existing Git repository on your system
3. Select the repository root folder (containing `.git`)
4. Click **Open**

**What's happening?** Treq scans the repository to:
- Verify it's a valid Git repository
- Check for existing worktrees
- Initialize the `.treq` folder for metadata storage

### Step 2: Configure Settings (Optional)

You can customize Treq's behavior in Settings:

1. Click the gear icon or press `Cmd+,` (macOS) / `Ctrl+,` (Windows/Linux)
2. Configure:
   - **Branch naming pattern**: Default is `treq/{name}`
   - **Post-create commands**: Commands to run after creating worktrees (e.g., `npm install`)
   - **Terminal settings**: Font, size, and shell preferences

Don't worry - you can change these settings anytime!

## Verifying Installation

To confirm Treq is working correctly:

1. Open Treq
2. Select a Git repository
3. You should see:
   - The dashboard with your main repository info
   - A "New Worktree" button
   - Any existing worktrees (if you already have some)

<!-- ![Treq dashboard](./images/installation-dashboard-view.png) -->
*The Treq dashboard shows your repository status*

## Updating Treq

Treq checks for updates automatically and will notify you when a new version is available.

**Manual update check**:
- macOS/Linux: **Treq** → **Check for Updates**
- Windows: **Help** → **Check for Updates**

## Troubleshooting Installation

### "Git not found" Error

**Cause**: Treq cannot find Git on your system PATH.

**Solution**:
1. Verify Git is installed: `git --version`
2. If Git is installed but not in PATH:
   - **macOS**: Restart Terminal after installing Git
   - **Linux**: Ensure `/usr/bin/git` exists
   - **Windows**: Reinstall Git and check "Add to PATH" during installation

### "Invalid Git Repository" Error

**Cause**: The selected folder is not a Git repository.

**Solution**:
1. Ensure the folder contains a `.git` subdirectory
2. Or initialize a new repository: `git init`
3. Select the repository root folder, not a subdirectory

### Application Won't Open

**macOS**: See the "First Launch" section above for security settings.

**Linux**:
- For AppImage: Ensure it's executable (`chmod +x`)
- Check if FUSE is installed: `sudo apt-get install fuse` (Ubuntu/Debian)

**Windows**:
- Run as Administrator if you encounter permission issues
- Check Windows Defender isn't blocking the application

### Performance Issues

If Treq feels slow on large repositories:
1. Ensure your Git repository isn't too large (>10GB)
2. Check that Git itself performs well: `time git status`
3. Consider excluding large files with `.gitignore`

## Uninstalling Treq

### macOS
- Drag Treq from Applications to Trash
- Remove config: `rm -rf ~/.treq`
- If installed via Homebrew: `brew uninstall --cask treq`

### Linux
- Debian/Ubuntu: `sudo dpkg -r treq`
- Fedora/RHEL: `sudo rpm -e treq`
- AppImage: Simply delete the file
- Remove config: `rm -rf ~/.config/treq`

### Windows
- Use "Add or Remove Programs" in Windows Settings
- Or run the uninstaller from the installation directory
- Config stored in: `%APPDATA%\treq`

## Next Steps

Now that Treq is installed, let's create your first worktree!

- [**Your First Worktree**](your-first-worktree) - Step-by-step tutorial
- [**Interface Overview**](interface-overview) - Learn the UI basics
- [**Core Workflows**](../core-workflows/using-treq-with-git-repo) - Essential workflows

## Getting Help

- **Issues**: [GitHub Issues](https://github.com/yourusername/treq/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/treq/discussions)
- **Documentation**: You're reading it! 📚
