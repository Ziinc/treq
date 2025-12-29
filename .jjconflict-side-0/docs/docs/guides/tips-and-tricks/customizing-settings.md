---
sidebar_position: 2
---

# Customizing Settings

_Personalize Treq to match your preferences and workflow._

Open settings with the gear icon (⚙️) in the sidebar. Settings are split into **repository-level** (specific to the current Git repository) and **application-level** (applies to all windows). Both persist after saving. If the `.treq` directory is deleted, repository-level settings are lost.

## Repository Settings

**Branch naming pattern**: Construct branch names using variables like `{name}` (intent from plan), `{user}` (git username), and `{date}` (YYYY-MM-DD). Examples: `feature/{name}`, `dev/{user}`, `bugfix/{name}-{date}`.

**Post-create commands**: Commands to run after creating worktrees, such as `npm ci` or `npm ci && npm run build && npm run dev`. Useful for installing dependencies or starting dev servers automatically.

**Copy files**: If dependencies are already present in the repository, use this to copy specific files or directories from `.gitignore` (like `node_modules/`) to new worktrees instead of reinstalling.

## Terminal Settings

Configure **font size** (12-16px recommended), **default shell** (auto-detect, bash, zsh, fish, or custom path), **scrollback buffer** (1000-10000 lines), **cursor style** (block, underline, or bar), and **cursor blink**. Shell arguments like `--login` or `-i` can be added for interactive sessions.

## Appearance

Choose **theme** (light, dark, or system), **UI density** (compact, normal, or comfortable), and **font scaling** (12-18px for UI elements, not terminal). Custom themes are planned for a future release.

## Diff Viewer

Toggle **line numbers**, **minimap**, **word wrap**, and **whitespace visibility**. Choose a syntax highlighting theme: GitHub, VS Code, Monokai, or Solarized variants.

## Git Preferences

**Commit settings**: Enable auto-stage (not recommended), set commit message templates, and configure validation rules like max length or requiring conventional commits.

**Merge settings**: Set default strategy (regular, squash, no-ff, or ff-only), conflict style (standard or diff3), and auto-stash before operations.

## Performance

Configure **file watching** with ignored patterns (`node_modules/`, `.git/`, `dist/`) and polling interval (100-1000ms). Adjust **git cache size** (100-1000 entries) and clear cache to force refresh. For large repositories, consider shallow clones, sparse checkout, or LFS support.

## Privacy

Anonymous usage data (feature statistics, error reports, performance metrics) can be disabled in Privacy settings. Plan history is stored in `.treq/plans/`. Use **Clear All Data** to reset everything (cannot be undone).

## Advanced

Enable **developer mode** for debug logs and experimental features (may be unstable). Choose **update channel**: stable (recommended), beta (early features), or nightly (latest, unstable). Database operations include backup, restore, and rebuild.

## Import/Export

Export settings as JSON via Settings → Advanced → Export to share with team members or back up. Import by selecting a JSON file and choosing which settings to apply. Reset individual categories or all settings to defaults in Advanced settings.

## Next Steps

- [Keyboard Shortcuts](/docs/keyboard-shortcuts)
- [Using Treq with Git Repo](../core-workflows/using-treq-with-git-repo)
- [Interface Overview](../getting-started/interface-overview)
