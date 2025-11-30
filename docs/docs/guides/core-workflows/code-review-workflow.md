---
sidebar_position: 5
---

# Code Review Workflow

Learn how to perform effective code reviews using Treq's built-in review tools with inline comments and annotations.

This guide covers:
- Starting a code review in Treq
- Navigating the review interface
- Adding inline comments and annotations
- Using the review summary panel
- Requesting changes vs approving
- Code review best practices

- **Prerequisites**: Treq installed, worktrees with changes to review

## Why Code Review in Treq?

Traditional code review workflows require:
- Switching branches or checking out PR branches
- Losing your current work context
- Using external review tools

**With Treq**:
- Review in a dedicated worktree without disrupting your work
- See full file context, not just diffs
- Test changes locally before approving
- Add detailed inline comments
- Export review summary for PRs/issues

## Starting a Code Review

### Review an Existing Worktree

If you've already created a worktree for a feature branch:

1. Open the worktree in dashboard
2. Click **"Review"** button on worktree card
3. Review interface opens

<!-- ![Start review from worktree](./images/review-from-worktree.png) -->
*The Review button opens the full review interface*

### Create Worktree from Remote Branch

To review someone else's branch:

**Step 1: Fetch Latest Changes**
```bash
git fetch origin
```

**Step 2: Create Worktree**
1. Click **"New Worktree"**
2. Select **"From existing branch"**
3. Choose the remote branch (e.g., `origin/feature/new-api`)
4. Click **"Create"**

**Step 3: Open Review**
- Click **"Review"** on the new worktree card
- Or right-click → **"Start Code Review"**

### Review from Pull Request

If using GitHub/GitLab:

**Step 1: Get Branch Name**
- Find PR branch name (e.g., `feature/user-auth`)

**Step 2: Create and Review**
1. Create worktree from that branch
2. Open review interface
3. Add PR number to review metadata (optional)

## The Review Interface

### Layout Overview

The review interface has four main areas:

<!-- ![Review interface layout](./images/review-interface-layout.png) -->
*Review interface optimized for thorough code examination*

**1. File Tree (Left)**
- Hierarchical file browser
- Shows all changed files
- File status indicators
- Viewed/unviewed tracking

**2. Diff Viewer (Center)**
- Side-by-side or unified diff
- Syntax highlighting
- Line numbers and change indicators
- Click-to-comment on any line

**3. Review Panel (Right)**
- All your comments/annotations
- Review summary
- Status and actions
- Export options

**4. Commit History (Bottom)**
- Commits in this branch
- Click to view specific commit
- Author and timestamp info

### File Tree Navigation

**File Status Icons**:
- **M** - Modified file
- **A** - Added (new file)
- **D** - Deleted file
- **R** - Renamed file

**Viewing Progress**:
- **✓** - Files you've reviewed
- **○** - Not yet reviewed
- Click to mark as reviewed manually

**Filtering**:
- Type in search box to filter files
- Show only modified/added/deleted
- Collapse/expand directories

**Keyboard Navigation**:
- `↓`/`↑` - Next/previous file
- `Enter` - Open selected file
- `Space` - Mark as reviewed

### Diff Viewer Modes

**Side-by-Side Mode** (default):
- Before (left) and after (right)
- Easy to spot changes
- Good for large modifications

**Unified Mode**:
- Single column with +/- indicators
- More compact
- Familiar to CLI users

**Toggle**: Click mode selector in toolbar

## Adding Comments and Annotations

### Inline Comments

To comment on specific lines:

**Step 1: Click Line**
1. Click on a line number in the diff
2. Comment input appears

<!-- ![Add comment](./images/review-add-comment.png) -->
*Click any line to add an inline comment*

**Step 2: Write Comment**
- Type your feedback
- Use markdown for formatting
- Tag severity if needed

**Step 3: Add Comment**
- Click **"Add Comment"** or press `Cmd+Enter`
- Comment appears in sidebar and on line

### Comment Types

**Question**:
```
❓ Why was this approach chosen over using a Map?
```

**Suggestion**:
```
💡 Consider using async/await here for better readability
```

**Issue**:
```
⚠️ This will cause a memory leak if not properly disposed
```

**Praise**:
```
👍 Great error handling here!
```

**Nitpick**:
```
🔧 Minor: missing semicolon on line 45
```

### Multi-Line Comments

To comment on a range of lines:

1. Click first line number
2. Hold `Shift` and click last line
3. Range is highlighted
4. Add comment

**Range indicator**: Comment shows "Lines 23-45"

### Thread Conversations

Reply to existing comments:

1. Find comment in review panel
2. Click **"Reply"**
3. Type response
4. Add reply

**Use cases**:
- Discuss implementation choices
- Clarify questions
- Provide additional context

### Editing and Deleting Comments

**Edit**:
1. Hover over your comment
2. Click edit icon (pencil)
3. Modify text
4. Save

**Delete**:
1. Hover over comment
2. Click delete icon (trash)
3. Confirm deletion

## Review Summary Panel

The right panel aggregates your review:

<!-- ![Review summary](./images/review-summary-panel.png) -->
*Summary panel collects all comments and provides actions*

### Summary Sections

**Review Status**:
- Draft (in progress)
- Completed (ready to submit)
- Approved
- Changes requested

**Comments Overview**:
- Total comments count
- By type (question, issue, suggestion)
- By file

**Files Changed**:
- Number of files
- Lines added/removed
- Overall diff stats

**Commit Information**:
- Number of commits
- Commit messages
- Authors involved

### Bulk Actions

**Mark All Reviewed**:
- Check off all files at once
- Useful after thorough review

**Clear Comments**:
- Start review over
- Removes all comments

**Export Review**:
- Copy to clipboard
- Save as markdown
- Format for GitHub/GitLab

## Reviewing Commit History

### Viewing Commits

The bottom panel shows commits in the branch:

<!-- ![Commit history](./images/review-commit-history.png) -->
*Review individual commits or the cumulative diff*

**Commit List**:
- Most recent first
- Commit hash (short)
- Message and author
- Timestamp

**Actions per Commit**:
- Click to view that commit's diff
- See commit details
- Jump to files changed in commit

### Reviewing by Commit vs Cumulative

**Commit-by-Commit**:
- Understand the development progression
- See thought process
- Identify where issues were introduced

**Cumulative Diff**:
- See overall changes from base
- Faster for small PRs
- Focus on end result

**Toggle**: Switch between modes in toolbar

## Review Strategies

### Strategy 1: Quick Pass

For small changes or hot fixes:

1. **Scan all files** (1-2 minutes)
   - Look for obvious issues
   - Check critical paths

2. **Spot check** (2-3 minutes)
   - Test one or two files thoroughly
   - Verify logic in key functions

3. **Approve or request minor fixes**

**Time**: 5-10 minutes

### Strategy 2: Thorough Review

For features or significant changes:

1. **Understand the goal** (5 minutes)
   - Read PR description
   - Review implementation plan if available
   - Understand context

2. **Review each file** (15-30 minutes)
   - Read every changed line
   - Check logic and edge cases
   - Add comments and questions

3. **Test locally** (10-15 minutes)
   - Run the code
   - Test functionality
   - Check for errors

4. **Provide detailed feedback**
   - Write summary
   - Request changes or approve

**Time**: 30-60 minutes

### Strategy 3: Pairing Review

For complex or critical changes:

1. **Schedule time** with author
2. **Screen share** the review interface
3. **Walk through together**
   - Author explains changes
   - Reviewer asks questions
   - Discuss alternatives

4. **Follow up** with written summary

**Time**: 30-90 minutes

## Requesting Changes

When issues need fixing:

### Document Issues Clearly

**Bad comment**:
```
This doesn't work
```

**Good comment**:
```
⚠️ This function doesn't handle null inputs, which will
cause a crash when users haven't set a profile picture.

Suggested fix:
if (!profilePicture) return defaultAvatar;
```

### Request Changes

1. Click **"Request Changes"** button
2. Add overall feedback (optional)
3. Submit

**What happens**:
- Review marked as "Changes Requested"
- Author is notified (if integrated)
- Comments exported to PR (if applicable)

### Optional: Create Implementation Plan

Treq can convert your review comments into an implementation plan:

1. Click **"Generate Plan from Comments"**
2. Treq creates a structured plan with:
   - Issues to fix
   - Suggestions to implement
   - Questions to answer
3. Author can execute the plan in Treq!

## Approving Changes

When everything looks good:

### Final Checks

Before approving:
- [ ] All files reviewed
- [ ] Code logic correct
- [ ] Tests present and passing
- [ ] No obvious bugs
- [ ] Follows team conventions
- [ ] Documentation updated
- [ ] No security issues

### Approve

1. Click **"Approve"** button
2. Add optional praise or summary
3. Submit

**What happens**:
- Review marked as "Approved"
- Ready to merge
- Can export approval to PR

## Exporting Review Summary

### Copy to Clipboard

1. Click **"Copy Summary"** in review panel
2. Format automatically generated
3. Paste into GitHub, GitLab, or Slack

**Generated format**:
```markdown
## Code Review Summary

**Reviewed by**: Your Name
**Date**: 2024-01-15
**Status**: Changes Requested

### Files Reviewed
- [x] src/auth/login.js (3 comments)
- [x] src/auth/middleware.js (1 comment)
- [x] tests/auth.test.js

### Comments

#### src/auth/login.js:23
⚠️ This function doesn't handle null inputs...

#### src/auth/login.js:45
💡 Consider using async/await here...

### Overall Feedback
Good implementation overall. A few edge cases need handling.
Please address the comments above and I'll approve.
```

### Save as File

1. Click **"Export"** → **"Save as Markdown"**
2. Choose location
3. File saved with timestamp

**Use cases**:
- Archive reviews
- Share offline
- Include in documentation

## Testing Changes Locally

### Running the Code

The worktree contains the actual code:

1. Open terminal in review session
2. Install dependencies (if needed)
   ```bash
   npm install
   ```

3. Run the application
   ```bash
   npm run dev
   ```

4. Test functionality manually

### Running Tests

```bash
# Unit tests
npm test

# Specific test file
npm test auth.test.js

# With coverage
npm test -- --coverage
```

### Debugging

If you find issues:

1. Set breakpoints in code
2. Run debugger
3. Reproduce the issue
4. Add comment with reproduction steps

## Collaborative Review

### Multiple Reviewers

If multiple people review:

**Sequential**:
1. First reviewer adds comments
2. Exports and shares summary
3. Second reviewer sees first's feedback
4. Adds their own comments

**Parallel**:
1. Each reviewer creates own worktree
2. Reviews independently
3. Merges feedback externally

### Author Responding to Feedback

After receiving review:

**Step 1: Review Feedback**
- Load review summary
- Understand all comments
- Prioritize issues

**Step 2: Address Comments**
- Fix issues
- Answer questions
- Implement suggestions

**Step 3: Update Branch**
- Commit fixes
- Push to remote
- Notify reviewers

**Step 4: Request Re-Review**
- In treq or on PR platform

## Code Review Best Practices

### As a Reviewer

1. **Be Constructive**: Suggest solutions, not just problems
2. **Be Specific**: Point to exact lines and issues
3. **Be Kind**: Remember there's a person behind the code
4. **Praise Good Work**: Don't only point out issues
5. **Ask Questions**: Understand intent before criticizing
6. **Focus on Important Issues**: Don't be overly pedantic
7. **Test the Code**: Don't just read it

### As an Author

1. **Provide Context**: Write good PR descriptions
2. **Self-Review First**: Catch obvious issues yourself
3. **Respond to Feedback**: Acknowledge comments
4. **Don't Take It Personally**: Code is not your identity
5. **Ask for Clarification**: If feedback is unclear
6. **Thank Reviewers**: Appreciate their time

### Team Guidelines

Establish review standards:

**Response Time**:
- Initial review within 24 hours
- Follow-up within 12 hours

**Review Depth**:
- Depend on change size and risk
- Critical changes get thorough review

**Approval Requirements**:
- How many approvals needed?
- Who can approve?
- Any auto-checks required?

## Keyboard Shortcuts

Speed up reviews with shortcuts:

**Navigation**:
- `J`/`K` - Next/previous file
- `N`/`P` - Next/previous comment
- `[`/`]` - Previous/next change
- `Enter` - Open selected file

**Actions**:
- `C` - Add comment on current line
- `R` - Mark file as reviewed
- `A` - Approve changes
- `X` - Request changes

**View**:
- `Cmd+F` - Find in file
- `Cmd+\` - Toggle side-by-side/unified
- `Esc` - Close dialogs

## Troubleshooting

### Can't Add Comments

**Cause**: Review mode not active.

**Solution**:
- Ensure you're in review interface
- Click "Start Review" if needed

### Comments Not Saving

**Cause**: Draft mode or connection issue.

**Solution**:
- Check review status
- Click "Save Draft" periodically
- Ensure Treq is not frozen

### Diff Not Loading

**Cause**: Very large file or binary.

**Solution**:
- Check file size
- For binary files, review original file
- Skip diffing for generated files

## Next Steps

After mastering code review:

- [**Merging Worktrees**](merging-worktrees) - Merge approved changes
- [**Creating Worktrees**](../common-tasks/creating-worktrees) - Create review worktrees
- [**Staging and Committing**](staging-and-committing) - Fix review feedback
