---
sidebar_position: 2
---

# Customizing Settings

Personalize Treq to match your preferences and workflow

To navigate to the application settings, click gear icon (⚙️) in sidebar. Alternatively, you can use the Command Palatte and use the "Open Settings" command.

## Repository Settings

Settings specific to current repository.

### Branch Naming Pattern

**Default**: `treq/{name}`

**Custom examples**:
- `feature/{name}` - Feature branch convention
- `{name}` - No prefix
- `dev/{name}` - Development prefix
- `bugfix/{name}` - For bug fixes

**Pattern variables**:
- `{name}` - Branch name you provide
- `{date}` - Current date (YYYY-MM-DD)
- `{user}` - Your git username

### Post-Create Commands

Commands to run after creating worktrees:

**Node.js projects**:
```bash
npm install
```

**Python projects**:
```bash
python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
```

**Multiple commands** (separated by `&&`):
```bash
npm install && npm run build && npm run dev &
```

**Disable per creation**: Uncheck in create dialog

### Working Directory Pattern

**Default**: `.treq/worktrees/{branch-name}`

**Custom** (not recommended):
- Breaks Treq's assumptions
- Can cause path issues
- Only change if necessary

## Terminal Settings

Customize terminal appearance and behavior.

### Font Settings

**Font Family**:
- Monospace fonts recommended
- Popular choices:
  - Fira Code (with ligatures)
  - JetBrains Mono
  - Source Code Pro
  - Cascadia Code
  - SF Mono (macOS)

**Font Size**: 12-16px recommended

**Line Height**: 1.2-1.5 for readability

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
- Underline (_)
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
