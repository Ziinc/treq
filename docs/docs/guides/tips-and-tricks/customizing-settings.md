---
sidebar_position: 2
---

# Customizing Settings

Personalize Treq to match your preferences and workflow

To navigate to the application settings, click gear icon (⚙️) in sidebar. Alternatively, you can use the Command Palatte and use the "Open Settings" command.

Setings are split into two categories:

- Repository-level settings: Configuration that applies only to that specific Git repository that is open in the current window.
- Application-level settings: Configuration that applies to all open windows.

Both settings will persist after saving. If the `.treq` directory is deleted, all repository-level settings will be lost.

## Repository Settings

Settings specific to current repository.

### Branch Naming
Branch names can be constructed from special variables:

- `name`: Intent, derived from implementation plan
- `user`: Git username
- `date`: Date in `YYYY-MM-DD` format

```txt
feature/{name} 
dev/{user}      
bugfix/{name}-{date}   
```

### Post-Create Commands

Commands can be set to be run after creating worktrees. This can perform commands like setup, dependencies installation, or pre-compilation.

```bash
npm ci
npm ci && npm run build && npm run dev
```

If files or dependecies are already present in the repository, then you instad use the copy-files setting to copy specific files or directories that may be in `.gitignore`.


## Terminal Settings

Customize terminal appearance and behavior.

### Font Settings

**Font Size**: 12-16px recommended

### Shell Preferences

**Default Shell**:

- Auto-detect (recommended)
- bash: `/bin/bash`
- zsh: `/bin/zsh`
- fish: `/usr/local/bin/fish`
- Custom path: Any shell executable

**Shell Arguments** (optional):

```bash
--login  # Load profile
-i       # Interactive
```

### Terminal Behavior

**Scrollback Buffer**: 1000-10000 lines

- Higher = more history
- Lower = less memory

**Cursor Style**:

- Block (█)
- Underline (\_)
- Bar (|)

**Cursor Blink**: On/Off

**Bell**: Visual, audio, or none

## Appearance

### Theme

**Options**:

- Light mode
- Dark mode
- System (follows OS preference)

**Custom themes** (coming soon)

### UI Density

**Compact**: More content, less padding
**Normal**: Balanced
**Comfortable**: More spacing

### Font Scaling

UI font size: 12-18px

**Affects**:

- Sidebar text
- Button labels
- Dialog text
- (Not terminal font)

## Diff Viewer

### Display Options

**Line Numbers**: Show/Hide
**Minimap**: Show/Hide on right side
**Word Wrap**: Wrap long lines
**White Space**: Show/Hide spaces and tabs

### Syntax Highlighting

**Theme**:

- GitHub Light/Dark
- VS Code Light/Dark
- Monokai
- Solarized Light/Dark

**Language Support**: Auto-detected

## Git Preferences

### Commit Settings

**Auto-stage**: Stage all files on commit (not recommended)
**Commit Message Template**: Pre-fill commit messages

**Validation**:

- Max length (50/72 rule)
- Require conventional commits
- Check for TODO/FIXME

### Merge Settings

**Default Strategy**: Regular, squash, no-ff, or ff-only
**Conflict Style**: Standard or diff3
**Auto-stash**: Stash before operations

## Keyboard Shortcuts

See [Keyboard Shortcuts guide](/docs/keyboard-shortcuts) for details.

**Customization**:

1. Settings → Keyboard Shortcuts
2. Find action to customize
3. Click and press new key combination
4. Save

**Reset**: Restore defaults anytime

## Performance

### File Watching

**Ignored Patterns**:

```
node_modules/
.git/
*.log
dist/
build/
```

**Polling Interval**: 100-1000ms

- Lower = more responsive
- Higher = less CPU usage

### Cache Settings

**Git Cache Size**: 100-1000 entries
**Clear Cache**: Forces refresh of all data

### Large Repositories

**Shallow Clone**: Fetch only recent history
**Sparse Checkout**: Only checkout needed files
**LFS Support**: For large binary files

## Privacy

### Telemetry

**Anonymous Usage Data**:

- Feature usage statistics
- Error reports
- Performance metrics

**Opt-out**: Disable in Privacy settings

### Data Storage

**Local Database**: `.treq/local.db`
**Plan History**: `.treq/plans/`
**Logs**: Platform-specific locations

**Clear All Data**: Nuclear option (can't undo)

## Advanced

### Developer Mode

Enable for:

- Debug logs
- Developer tools
- Experimental features

**Warning**: May be unstable

### Update Settings

**Auto-update**: Check automatically
**Update Channel**:

- Stable (recommended)
- Beta (early features)
- Nightly (latest, unstable)

### Database

**Backup Database**: Export to file
**Restore Database**: Import from backup
**Rebuild Database**: Recreate from filesystem

## Importing/Exporting Settings

### Export Settings

1. Settings → Advanced → Export
2. Save JSON file
3. Share with team or backup

### Import Settings

1. Settings → Advanced → Import
2. Select JSON file
3. Choose which settings to import
4. Apply

**Use cases**:

- Team standardization
- New machine setup
- Restore from backup

## Resetting Settings

### Reset All

Settings → Advanced → Reset to Defaults

**What's reset**:

- All preferences
- Keyboard shortcuts
- Theme and appearance

**What's preserved**:

- Repository data
- Worktrees
- Commit history

### Reset Category

Reset only specific category:

- Repository settings only
- Terminal settings only
- Appearance only

## Best Practices

1. **Start with Defaults**: Learn before customizing
2. **Document Changes**: Note why you changed things
3. **Export Settings**: Backup your configuration
4. **Team Standards**: Align with team preferences
5. **Update Gradually**: Don't change everything at once

## Troubleshooting

**Settings not saving**: Check file permissions
**Custom theme not working**: Verify theme file format
**Keyboard shortcuts conflicting**: Reset and reconfigure

## Next Steps

- [Keyboard Shortcuts](/docs/keyboard-shortcuts)
- [Using Treq with Git Repo](../core-workflows/using-treq-with-git-repo)
- [Interface Overview](../getting-started/interface-overview)
