---
sidebar_position: 6
---

# Merging Worktrees

Learn how to safely merge worktrees back into your main branch using Treq's merge tools and strategies.

This guide covers:
- When and how to merge worktrees
- Understanding different merge strategies
- Pre-merge checks and preparation
- Handling merge conflicts
- Post-merge cleanup
- Best practices for merging

- **Prerequisites**: Worktree with committed changes ready to merge

## Understanding Merging

### What is a Merge?

**Merging** combines changes from one branch (source) into another (target):

```
Source Branch (worktree): treq/add-feature
           ↓
        MERGE
           ↓
Target Branch:            main
```

**Result**: Changes from your worktree appear in the main branch.

### Merge vs Rebase

**Merge**:
- Creates a merge commit
- Preserves complete history
- Shows when branches diverged and merged
- Safer for collaboration

**Rebase** (not covered here):
- Rewrites history linearly
- Cleaner history
- More complex
- Can cause issues if branch is shared

**Treq focuses on merging** for safety and clarity.

## When to Merge

Merge your worktree when:

✅ **Feature is complete**
- All planned functionality implemented
- Tests passing
- Documentation updated

✅ **Code is reviewed**
- Reviewed by teammate(s)
- Feedback addressed
- Approved

✅ **Branch is up-to-date**
- Synced with latest main
- No conflicts expected
- Tested against recent changes

❌ **Don't merge if**:
- Work in progress
- Tests failing
- Conflicts unresolved
- Not reviewed (if required)

## Pre-Merge Checklist

Before merging, verify:

### 1. All Changes Committed

**Check worktree status**:
- No unstaged changes (orange section empty)
- No uncommitted changes
- Working directory clean

**In Treq**:
- Look at worktree card
- Should show "Clean" or "All committed"
- No file change indicators

**In terminal**:
```bash
git status
# Should show: "nothing to commit, working tree clean"
```

### 2. Tests Passing

Run your test suite:

```bash
npm test
# or
pytest
# or
cargo test
```

**All tests must pass** before merging.

### 3. Branch Up-to-Date

Check if main has new commits:

**In Treq worktree card**:
- Look for divergence indicator
- "↓3" means 3 commits behind main
- Need to sync before merging

**Update your branch**:

**Option A: Merge main into branch**
```bash
git merge main
# Resolve any conflicts
```

**Option B: Rebase onto main** (advanced)
```bash
git rebase main
# Resolve conflicts interactively
```

### 4. Pushed to Remote (Optional)

If working with a team:

```bash
git push origin treq/add-feature
```

**Why**: Backup of work before merging.

## Starting a Merge

### From the Dashboard

1. Find your worktree card
2. Click **"Merge"** button
3. Merge dialog opens

<!-- ![Merge button on worktree](./images/merge-worktree-button.png) -->
*The Merge button is prominently displayed on worktree cards*

### From Context Menu

Right-click worktree card → **"Merge into..."**

### The Merge Dialog

The dialog shows:

<!-- ![Merge dialog](./images/merge-dialog-overview.png) -->
*Merge dialog provides pre-merge checks and strategy selection*

**Source Branch**:
- Your worktree branch (e.g., `treq/add-feature`)
- Shown with commit count

**Target Branch**:
- Where to merge (usually `main`)
- Dropdown to select different target
- Shows current state

**Pre-Merge Checks**:
- ✅ No uncommitted changes in worktree
- ✅ No uncommitted changes in main
- ✅ Branches can be merged
- ⚠️ Warnings if issues detected

**Merge Preview**:
- Files that will change
- Commits to be merged
- Potential conflicts (if detected)

## Choosing a Merge Strategy

Treq supports four merge strategies:

### Strategy 1: Regular Merge (Default)

**What it does**:
- Creates a merge commit
- Preserves all commits from your branch
- Shows complete history

**Command**: `git merge --no-ff treq/add-feature`

**History looks like**:
```
*   Merge branch 'treq/add-feature'
|\
| * Add feature part 3
| * Add feature part 2
| * Add feature part 1
|/
* Previous main commit
```

**When to use**:
- Most common scenario
- Want to preserve detailed history
- Multiple commits in branch

**Pros**: Complete history, easy to understand
**Cons**: Can create cluttered history

### Strategy 2: Squash Merge

**What it does**:
- Combines all commits into one
- Creates single commit on main
- Loses individual commit history

**Command**: `git merge --squash treq/add-feature`

**History looks like**:
```
* Add complete feature (squashed)
* Previous main commit
```

**When to use**:
- Many small/WIP commits
- Want clean main branch history
- Individual commits not important

**Pros**: Clean history, single commit
**Cons**: Loses detailed progression

### Strategy 3: No Fast-Forward

**What it does**:
- Always creates merge commit
- Even if branch could fast-forward
- Explicitly shows merge happened

**Command**: `git merge --no-ff treq/add-feature`

**When to use**:
- Want merge commit for documentation
- Tracking when features merged
- Team policy requires it

**Pros**: Clear merge points, traceability
**Cons**: Extra commit even for simple merges

### Strategy 4: Fast-Forward Only

**What it does**:
- Only merges if no divergence
- No merge commit created
- Linear history maintained

**Command**: `git merge --ff-only treq/add-feature`

**When to use**:
- Branch is ahead of main (no new main commits)
- Want linear history
- Simple, straightforward changes

**Pros**: Clean, linear history
**Cons**: Fails if branches diverged

**Note**: If this strategy can't be used, Treq will show a warning.

### Comparing Strategies

| Strategy | Merge Commit | Preserves History | Linear | Best For |
|----------|--------------|-------------------|---------|----------|
| Regular | Yes | Yes | No | Most cases |
| Squash | No | No | Yes | Clean history |
| No-FF | Always | Yes | No | Documentation |
| FF-Only | Never | Yes | Yes | Simple changes |

**Recommendation**: Use **Regular merge** unless you have specific reasons for others.

## Performing the Merge

### Step-by-Step

**Step 1: Select Strategy**
- Choose from dropdown in merge dialog
- Default is "Regular Merge"

**Step 2: Review Changes One More Time**
- Click **"Review Changes"** to see full diff
- Ensure everything is correct
- Check for unintended changes

**Step 3: Handle Uncommitted Changes**

If main repo has uncommitted changes:

**Options**:
- **Discard changes**: Throw away main repo changes (risky!)
- **Stash changes**: Save for later
- **Commit first**: Commit in main repo before merging

**Treq prompts you** if uncommitted changes detected.

**Step 4: Write Merge Commit Message**

For regular/no-ff merges:

- Default message provided
- Customize if desired
- Follow team conventions

Example:
```
Merge branch 'treq/add-feature' into main

- Add user authentication
- Implement JWT tokens
- Add login/logout endpoints
- Update documentation
```

**Step 5: Execute Merge**

1. Click **"Merge"** button
2. Treq runs the merge command
3. Progress shown
4. Result displayed

### Merge Success

**If successful**:
- ✅ Success message shown
- Worktree updated
- Main branch has new commits
- Dashboard refreshes

**Next steps after success**:
- Test merged code in main
- Push to remote
- Delete worktree (optional)

## Handling Merge Conflicts

### What are Conflicts?

**Conflicts occur** when:
- Same lines modified in both branches
- File deleted in one branch, modified in other
- Git can't automatically merge

**Example**:
```javascript
// In main:
const apiUrl = "https://api.example.com/v1";

// In your branch:
const apiUrl = "https://api.example.com/v2";

// Git doesn't know which to keep!
```

### Conflict Indicators in Treq

**Before merge**:
- Treq analyzes potential conflicts
- Shows warning: "⚠️ 2 files may have conflicts"
- Lists conflicted files

**During merge**:
- Merge pauses if conflicts detected
- Terminal shows conflict markers
- Treq guides you to resolve

### Resolving Conflicts

**Step 1: Identify Conflicted Files**

In terminal:
```bash
git status
# Shows "both modified" or "both added" files
```

**Step 2: Open Conflicted File**

Files contain conflict markers:

```javascript
const apiUrl = "<<<<<<<HEAD
https://api.example.com/v1
=======
https://api.example.com/v2
>>>>>>> treq/add-feature";
```

**Step 3: Resolve Conflict**

Choose one:

**Keep yours** (remove HEAD section):
```javascript
const apiUrl = "https://api.example.com/v2";
```

**Keep theirs** (remove branch section):
```javascript
const apiUrl = "https://api.example.com/v1";
```

**Keep both** or **merge manually**:
```javascript
// Use environment variable to choose
const apiUrl = process.env.API_VERSION === "v2"
  ? "https://api.example.com/v2"
  : "https://api.example.com/v1";
```

**Remove conflict markers** (`<<<<<<<`, `=======`, `>>>>>>>`).

**Step 4: Stage Resolved Files**

```bash
git add file-with-conflict.js
```

**Step 5: Complete Merge**

```bash
git commit
# Opens editor with pre-filled merge message
# Save and close to complete merge
```

**Or in Treq**:
- Stage resolved files in diff viewer
- Click "Commit" with merge message
- Merge completes

### Aborting a Merge

If conflicts are too complex:

```bash
git merge --abort
```

**What happens**:
- Merge is cancelled
- Returns to pre-merge state
- No changes applied to main
- Try again later after resolving issues

## Post-Merge Actions

### Verify the Merge

After merging:

**1. Check Main Branch**

Switch to main repository view:
```bash
cd /path/to/main/repo
git log --oneline
```

**Should see**:
- Your merge commit
- Or your squashed commits

**2. Test Functionality**

Run the application:
```bash
npm run dev
# or
python manage.py runserver
```

**Verify**:
- New feature works
- Existing features still work
- No regressions introduced

**3. Run Full Test Suite**

```bash
npm test
# All tests should pass
```

### Push to Remote

Share your merge:

```bash
git push origin main
```

**What happens**:
- Remote main updated
- Team sees your changes
- CI/CD triggered (if configured)

### Clean Up Worktree

After successful merge:

**Option 1: Delete Immediately**

1. Return to dashboard
2. Click **"Delete"** on worktree card
3. Confirm deletion

**What's deleted**:
- Worktree directory
- Terminal sessions
- Database entry
- Local branch

**Remote branch remains** (delete separately if needed).

**Option 2: Keep Temporarily**

Keep worktree if:
- Want to compare with main
- Might need to make follow-up changes
- Testing merge before finalizing

Delete later when confident.

### Delete Remote Branch

If pushed to remote:

```bash
git push origin --delete treq/add-feature
```

**Or on GitHub/GitLab**:
- PRs usually have "Delete branch" button after merge

## Merge Best Practices

### Before Merging

1. **Test Thoroughly**: Run all tests in worktree
2. **Review Your Changes**: Do self-review before asking others
3. **Update Documentation**: README, comments, API docs
4. **Sync with Main**: Merge latest main into branch first
5. **Check Commit History**: Clean up if needed

### During Merging

1. **Choose Right Strategy**: Regular merge for most cases
2. **Write Good Merge Message**: Explain what was merged
3. **Resolve Conflicts Carefully**: Don't rush
4. **Test After Resolving**: Conflicts can introduce bugs

### After Merging

1. **Verify Main Branch**: Check merge worked correctly
2. **Run Tests in Main**: Ensure everything still works
3. **Push Promptly**: Share changes with team
4. **Clean Up Worktrees**: Delete merged branches
5. **Monitor CI/CD**: Watch for failures

### Team Workflows

**Pull Request Based**:
1. Create worktree from feature branch
2. Make changes and push
3. Create PR on GitHub/GitLab
4. Review and approve in platform
5. Merge via platform (may use Treq for local testing)

**Direct to Main**:
1. Create worktree for feature
2. Complete work
3. Review locally or with team
4. Merge using Treq
5. Push to remote

## Troubleshooting

### Merge Button Disabled

**Causes**:
- Uncommitted changes in worktree or main
- Branch not up-to-date
- No commits to merge

**Solutions**:
- Commit or stash changes
- Update branch from main
- Ensure worktree has commits

### "Uncommitted Changes" Error

**Cause**: Working tree not clean in target branch.

**Solution**:
- Switch to main repository view
- Commit or stash changes
- Try merge again

### Merge Conflicts Too Complex

**Solution**:
1. Abort merge: `git merge --abort`
2. Update branch from main first: `git merge main`
3. Resolve conflicts in worktree
4. Push updates
5. Try merge again

### After Merge, Tests Fail

**Causes**:
- Conflict resolution was incorrect
- Integration issues with main
- New main code incompatible

**Solutions**:
1. **If just pushed**: Revert merge commit
   ```bash
   git revert -m 1 HEAD
   git push
   ```

2. **If not pushed yet**: Reset to before merge
   ```bash
   git reset --hard HEAD^
   ```

3. Fix issues in worktree
4. Merge again

## Advanced Merge Scenarios

### Merging Between Worktrees

Merge one worktree into another (not main):

1. Open target worktree terminal
2. Run manual merge:
   ```bash
   git merge treq/source-branch
   ```

3. Resolve conflicts
4. Commit

### Cherry-Picking Specific Commits

Want only some commits from worktree?

1. Note commit hashes from worktree
2. Switch to target branch
3. Cherry-pick:
   ```bash
   git cherry-pick abc123 def456
   ```

### Interactive Rebase Before Merge

Clean up commits before merging:

1. In worktree terminal:
   ```bash
   git rebase -i main
   ```

2. Squash, reorder, or edit commits
3. Force push if already pushed: `git push --force`
4. Then merge normally

## Next Steps

After merging your worktrees:

- [**Pushing to Remote**](../common-tasks/pushing-to-remote) - Share your merged changes
- [**Creating Worktrees**](../common-tasks/creating-worktrees) - Start your next feature
- [**Code Review Workflow**](code-review-workflow) - Review before merging next time
