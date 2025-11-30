---
sidebar_position: 4
---

# Staging and Committing Changes

Master Git staging and committing with Treq's visual tools for managing your changes effectively.

This guide covers:
- Understanding staged vs unstaged changes
- Using the diff viewer to review changes
- Staging files, hunks, and individual lines
- Creating meaningful commits
- Best practices for atomic commits

- **Prerequisites**: Treq installed with changes to commit

## Understanding Git Staging

### Staged vs Unstaged Changes

Git has a **two-stage commit** process:

**Working Directory (Unstaged)**:
- Files you've modified but not staged
- Shown in orange/yellow in Treq
- Not included in the next commit

**Staging Area (Staged)**:
- Files ready to be committed
- Shown in green in Treq
- Will be included in the next commit

**Why staging matters**:
- Review changes before committing
- Create focused, atomic commits
- Stage only related changes together

### The Staging Workflow

```
Edit Files → Review Diffs → Stage Changes → Commit → Push
     ↓            ↓              ↓           ↓         ↓
 Working      Diff Viewer    Staging    History   Remote
 Directory                    Area
```

## Accessing the Diff Viewer

### From the Dashboard

**Main Repository**:
1. Look at the left "Git Changes" section
2. Click on a changed file
3. Diff viewer opens on the right

<!-- ![Dashboard git changes](./images/staging-dashboard-changes.png) -->
*Git changes section shows staged and unstaged files*

**Worktree Cards**:
1. Look for change indicator (📊) on worktree card
2. Click **"View Changes"** button
3. Or click the file count

### From a Terminal Session

1. Open a worktree session
2. Click **"Staging"** tab/button on the right side
3. Diff viewer appears next to terminal

<!-- ![Session staging view](./images/staging-session-view.png) -->
*The staging panel appears alongside your terminal*

## The Diff Viewer Interface

### File Tree

The top section shows your changed files:

**Staged Changes** (Green Section):
- Files ready to commit
- Click to view staged diff
- Actions: Unstage, View

**Unstaged Changes** (Orange Section):
- Modified but not staged
- Click to view unstaged diff
- Actions: Stage, Discard, View

**File Status Icons**:
- **M**: Modified file
- **A**: Added (new file)
- **D**: Deleted file
- **R**: Renamed file
- **??**: Untracked file

<!-- ![File tree](./images/staging-file-tree.png) -->
*File tree organizes files by staging status*

### Diff Display

The bottom section shows the actual changes:

**Monaco Editor Features**:
- Syntax highlighting by file type
- Line numbers on both sides
- Change indicators:
  - **+ Green**: Lines added
  - **- Red**: Lines removed
  - **~ Yellow**: Lines modified (rare)

**Navigation**:
- Scroll to view all changes
- Click on hunks (change sections) to focus
- Minimap shows document overview

## Staging Files

### Stage Entire File

**Method 1: File Tree**
- Click the **"+"** icon next to the file
- File moves to "Staged Changes" section

**Method 2: Right-Click**
- Right-click on the file
- Select **"Stage File"**

**Method 3: Keyboard**
- Select file
- Press `S` (stage) or `Space`

### Stage All Files

Click **"Stage All"** button at the top of file tree.

**Keyboard**: `Cmd+Shift+S` / `Ctrl+Shift+S`

**What happens**:
- All unstaged files move to staged
- Equivalent to `git add .`

### Unstage Files

To remove from staging area:

**Method 1**: Click **"-"** icon on staged file
**Method 2**: Right-click → **"Unstage File"**
**Method 3**: Press `U` (unstage)

**Unstage All**: `Cmd+Shift+U` / `Ctrl+Shift+U`

## Line-Level Staging

### Why Stage Individual Lines?

Sometimes you want to commit only part of a file:

**Use cases**:
- Split unrelated changes into separate commits
- Commit the feature, leave debug code unstaged
- Create atomic commits from mixed changes

### How to Stage Lines

**Step 1: Select Lines**

In the diff viewer:
1. Click on a line number
2. Hold `Shift` and click another line to select a range
3. Or click and drag to select

<!-- ![Line selection](./images/staging-line-select.png) -->
*Selected lines are highlighted in the diff viewer*

**Step 2: Stage Selection**

- Click **"Stage Selected Lines"** button
- Or right-click → **"Stage Selection"**

**What happens**:
- Treq creates a partial patch
- Only selected lines are staged
- File appears in both staged and unstaged (partially staged)

### Hunk-Level Staging

A **hunk** is a contiguous block of changes. To stage an entire hunk:

1. Click anywhere in the hunk
2. Click **"Stage Hunk"** button
3. Or press `H`

**Keyboard shortcut**: Navigate hunks with `J`/`K`, stage with `H`

### Viewing Partially Staged Files

When a file is partially staged:

- It appears in **both** staged and unstaged sections
- Staged section shows what will be committed
- Unstaged section shows remaining changes

To view:
- Click on file in either section
- Toggle between staged/unstaged view

## Creating Commits

### Writing Commit Messages

After staging changes:

**Step 1: Focus Commit Input**

- Click the commit message text area
- Or press `C` to focus

**Step 2: Write Message**

Follow conventional commit format:

```
type(scope): brief description

Longer explanation if needed.
Can span multiple lines.

- Bullet points for details
- Related issues: #123
```

**Commit Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Formatting, no code change
- `refactor`: Code restructuring
- `test`: Adding tests
- `chore`: Maintenance tasks

**Examples**:
```
feat(auth): add JWT token refresh endpoint

fix(api): handle null values in user profile

docs(readme): update installation instructions

refactor(utils): simplify date formatting logic
```

**Character Limit**: Treq shows a counter; aim for 50-72 characters in the first line.

### Committing

**Step 3: Create Commit**

- Click **"Commit"** button
- Or press `Cmd+Enter` / `Ctrl+Enter`

**What happens**:
- Treq runs `git commit -m "your message"`
- Staged changes become a commit
- Staging area clears
- Commit appears in history

<!-- ![Successful commit](./images/staging-commit-success.png) -->
*Success message shows commit hash and file count*

### Commit Validation

Treq validates before committing:

**Checks**:
- ✅ Commit message not empty
- ✅ At least one file staged
- ✅ No merge conflicts
- ✅ Not in detached HEAD state

**If validation fails**:
- Error message explains the issue
- Fix the problem and try again

## Reviewing Changes Before Committing

### Best Practice: Always Review

Before staging/committing:

**1. Check Each File**
- Click through every changed file
- Understand what changed and why
- Look for unintended changes

**2. Look for Mistakes**
- Debug statements left in code
- Console logs or print statements
- Commented-out code
- TODOs that shouldn't be committed

**3. Verify Formatting**
- Consistent indentation
- No trailing whitespace
- Proper line endings

**4. Check for Secrets**
- API keys or passwords
- `.env` files with secrets
- Private URLs or credentials

### Using Diff Viewer Features

**Search in Diff**:
- Press `Cmd+F` / `Ctrl+F`
- Search for keywords (e.g., "console.log", "TODO")
- Review each occurrence

**Filter Files**:
- Type in file tree search
- Filter by file type or path
- Focus on specific changes

**Viewed Files**:
- Treq marks files you've reviewed with ✓
- Helps track what you've checked
- Resets after commit

## Atomic Commits

### What are Atomic Commits?

An **atomic commit** contains:
- One logical change
- All files needed for that change
- Nothing unrelated

**Benefits**:
- Easier code review
- Simpler to revert if needed
- Clear project history
- Better git bisect results

### Creating Atomic Commits

**Bad Practice** (One big commit):
```
fix: multiple changes

- Add user authentication
- Fix login bug
- Update documentation
- Refactor database queries
- Add new API endpoint
```

**Good Practice** (Atomic commits):
```
1. feat(auth): add user authentication system
2. fix(auth): handle edge case in login validation
3. docs(auth): document authentication endpoints
4. refactor(db): optimize user query performance
5. feat(api): add profile update endpoint
```

### How to Create Atomic Commits in Treq

**Step 1: Group Related Changes**
- Identify which files belong together
- Stage only those files

**Step 2: Commit the Group**
- Write focused commit message
- Commit

**Step 3: Repeat for Other Groups**
- Stage next logical group
- Commit
- Continue until all changes committed

**Example Workflow**:
```bash
# Commit 1: Feature implementation
Stage: UserAuth.js, authMiddleware.js
Commit: "feat(auth): implement JWT authentication"

# Commit 2: Tests for feature
Stage: UserAuth.test.js, auth.test.js
Commit: "test(auth): add tests for authentication"

# Commit 3: Documentation
Stage: README.md, API.md
Commit: "docs: document authentication setup"
```

## Discarding Changes

### Unstaging vs Discarding

**Unstage**: Move from staged back to unstaged (changes preserved)
**Discard**: Permanently delete changes (cannot be undone!)

### Discarding Unstaged Changes

To throw away changes to a file:

1. Right-click on file in unstaged section
2. Select **"Discard Changes"**
3. **Confirm** (this is permanent!)

**Keyboard**: Select file and press `Delete`

**What happens**:
- File reverts to last committed state
- All changes lost permanently
- Equivalent to `git checkout -- file`

### Discarding All Changes

Click **"Discard All"** button with caution:
- Shows confirmation dialog
- Lists all files that will be affected
- Only proceeds if you confirm

**When to use**:
- Abandoning experimental changes
- Starting over on a feature
- Cleaning up after review

### Safe Alternatives to Discarding

Before discarding, consider:

**Option 1: Stash Changes**
```bash
git stash save "description of changes"
# Changes saved, working directory clean
# Restore later with: git stash pop
```

**Option 2: Commit to Temporary Branch**
```bash
git checkout -b temp-backup
git add .
git commit -m "temp: backup of work in progress"
git checkout original-branch
```

**Option 3: Move to Another Worktree**
- Use Treq's "Move to Worktree" feature
- Preserves changes in different worktree
- Cleans up current worktree

## Amending Commits

### When to Amend

Amend the last commit when you:
- Forgot to include a file
- Made a typo in commit message
- Want to add more changes to same logical commit

**Important**: Only amend commits that haven't been pushed!

### How to Amend in Treq

**Step 1: Stage Additional Changes**
- Stage the files you want to add

**Step 2: Amend**
- Check **"Amend Last Commit"** checkbox
- Edit commit message if needed
- Click **"Commit"**

**What happens**:
- Last commit is modified
- New changes incorporated
- Commit hash changes

**Command equivalent**: `git commit --amend`

### Viewing Commit History

To see your commits:

1. Click **"History"** button (if available)
2. Or run in terminal: `git log --oneline`

Shows:
- Commit hashes
- Commit messages
- Authors and dates

## Advanced Staging Techniques

### Interactive Staging from Terminal

While Treq's visual tools are convenient, you can also use git commands:

```bash
# Interactive staging
git add -p file.js

# Stage specific files
git add src/auth.js src/middleware.js

# Stage all files of a type
git add *.js

# Stage all in a directory
git add src/components/
```

### Staging Renamed Files

When you rename a file, git shows it as delete + add. To stage as rename:

- Stage both the deleted and added versions
- Git automatically detects it as a rename
- Appears as "R" status in Treq

### Staging Binary Files

Binary files (images, PDFs, etc.) can't show diffs:

- Treq shows **"Binary file"** message
- Stage entire file (no line-level staging)
- Shows file size change

### Large Files

For files >1MB:

- Diff may be slow to load
- Consider staging without previewing
- Use `.gitignore` for very large files

## Commit Workflow Patterns

### Pattern 1: Checkpoint Commits

While developing, commit frequently:

```
Work → Stage → Commit (WIP)
Work → Stage → Commit (WIP)
Work → Stage → Commit (WIP)
Final → Stage → Commit (feat: complete feature)
```

Before merging, squash WIP commits.

### Pattern 2: Feature Branch Commits

Each logical step is a commit:

```
feat(api): add endpoint structure
feat(api): implement validation
feat(api): add database integration
test(api): add endpoint tests
docs(api): document new endpoint
```

### Pattern 3: Test-Driven Development

Commit pattern for TDD:

```
test(feature): add failing tests
feat(feature): implement to pass tests
refactor(feature): clean up implementation
```

## Best Practices

1. **Review Before Staging**: Always check diffs
2. **Stage Logically**: Group related changes
3. **Write Clear Messages**: Future you will thank you
4. **Commit Often**: Small commits are better
5. **One Concern Per Commit**: Keep commits atomic
6. **Use Conventions**: Follow team's commit message format
7. **Never Commit Secrets**: Check for sensitive data
8. **Test Before Committing**: Ensure code works

## Troubleshooting

### Can't Stage Files

**Cause**: File might be in `.gitignore` or permissions issue.

**Solution**:
- Check `.gitignore` for patterns matching file
- Verify file exists with `ls`
- Check file permissions

### Diff Not Showing

**Cause**: Binary file, very large file, or encoding issue.

**Solution**:
- Check if file is binary
- For large files, stage without preview
- Verify file encoding (UTF-8 recommended)

### Commit Button Disabled

**Cause**: No staged files or empty commit message.

**Solution**:
- Ensure at least one file is staged
- Write a commit message
- Check validation errors

### Partial Staging Not Working

**Cause**: File has conflicting changes or git limitation.

**Solution**:
- Try staging entire hunks instead
- Or stage entire file and unstage unwanted parts
- Use `git add -p` in terminal for complex cases

## Next Steps

Now that you can stage and commit effectively:

- [**Code Review Workflow**](code-review-workflow) - Review staged changes with others
- [**Merging Worktrees**](merging-worktrees) - Merge your commits back to main
- [**Pushing to Remote**](../common-tasks/pushing-to-remote) - Share your commits

