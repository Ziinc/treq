# Documentation Rework Instructions

_Instructions for AI agents to condense and rework verbose documentation._

## Objective

Reduce documentation while preserving essential information. Convert bullet-heavy, header-heavy formatting to flowing prose. Remove implementation details users don't need. Ensure high readability.

- In technical documentation, jargon is ok.
- In guides, avoid jargon and always interlink to technical documentation when jargon must be used.

## Approach

1. **Read the entire file** to understand its purpose
2. **Identify the 3-5 core concepts** users actually need
3. **Rewrite from scratch** using the style guide below
4. **Target 40-80 lines** for most files (previously 150-600+)

---

## Style Guide

### Structure

```markdown
---
sidebar_position: N
---

# Title

_One-line italicized description of what this page covers._

Opening paragraph explaining the concept in 2-3 sentences. No bullet lists here.

## Section Header

Paragraph explaining this topic. Use **bold** for key terms inline rather than as list items. Continue with more sentences that flow naturally.

## Next Section

More flowing prose. Only use code blocks for actual commands users will run, not for showing data structures or implementation details.

## Next Steps

- [Related Guide](link) — Brief description
- [Another Guide](link) — Brief description
```

### Rules

1. **One H1, few H2s, avoid H3/H4** — Flat structure, not deep nesting
2. **Paragraphs over bullets** — Convert lists to comma-separated prose
3. **No implementation details** — Remove TypeScript interfaces, JSON schemas, SQL tables
4. **No obvious advice** — Skip "best practices" that are self-evident
5. **Bold inline, not as headers** — Use **term** within sentences
6. **Code blocks only for commands** — Things users will actually type/run

---

## Patterns to Fix

### ❌ Excessive Bullets → ✅ Prose

**Before (bad):**

```markdown
## Features

The dashboard shows:

- Worktree status
- Branch names
- Commit divergence
- Uncommitted changes
- Quick actions
```

**After (good):**

```markdown
## Features

The dashboard shows worktree status, branch names, commit divergence (ahead/behind), uncommitted changes, and quick actions for each worktree.
```

---

### ❌ Too Many Headers → ✅ Combined Sections

**Before (bad):**

```markdown
## Creating Sessions

### Automatic Session Creation

When you create a worktree...

### Manual Session Creation

To create an additional session...

### Session Options

You can configure...
```

**After (good):**

```markdown
## Creating Sessions

When you create a worktree and click "Open," Treq automatically creates a session. To create additional sessions, right-click the worktree and select **New Session**. Configure session options in Settings → Terminal.
```

---

### ❌ Implementation Details → ✅ User-Focused

**Before (bad):**

````markdown
## Comment Model

```typescript
interface ReviewComment {
  id: string;
  filePath: string;
  lineNumber: number;
  content: string;
  type: "question" | "issue" | "suggestion";
}
```
````

Comments are stored in the database with...

````

**After (good):**
```markdown
## Comments

Click any line number to add a comment. Comments can be categorized as questions, issues, or suggestions. Use markdown for formatting.
````

---

### ❌ Verbose Steps → ✅ Condensed Flow

**Before (bad):**

```markdown
## Step 1: Open the Dialog

First, you need to open the create worktree dialog:

1. Click the "New Worktree" button in the dashboard
2. Or press `Cmd+N` / `Ctrl+N`
3. The dialog will appear

## Step 2: Enter Branch Name

Now enter your branch name:

1. Type a name like "add-feature"
2. Treq will format it according to your pattern
3. The preview shows the final branch name

## Step 3: Click Create

Finally, create the worktree:

1. Review your settings
2. Click "Create Worktree"
3. Wait for completion
```

**After (good):**

```markdown
## Creating a Worktree

Click **New Worktree** (or `Cmd+N`) to open the dialog. Enter a branch name like `add-feature`—Treq applies your naming pattern automatically. Click **Create Worktree** to finish.
```

---

### ❌ Redundant Explanations → ✅ Trust the Reader

**Before (bad):**

```markdown
## What is a Worktree?

A worktree is a separate working directory. This means you can have multiple working directories. Each directory has its own branch. The branches are independent. You can work on multiple features at once. This is useful for parallel development.

### Why Use Worktrees?

Worktrees are useful because:

- You can work on multiple branches
- Each branch is isolated
- Changes don't affect other branches
- You can switch contexts easily
```

**After (good):**

```markdown
Worktrees let you work on multiple branches simultaneously, each in its own directory. Changes in one worktree don't affect others.
```

---

### ❌ Obvious Best Practices → ✅ Remove or Condense

**Before (bad):**

```markdown
## Best Practices

1. **Review Before Staging**: Always check diffs before staging
2. **Stage Logically**: Group related changes together
3. **Write Clear Messages**: Future you will thank you
4. **Commit Often**: Small commits are better than large ones
5. **One Concern Per Commit**: Keep commits atomic
6. **Use Conventions**: Follow team's commit message format
7. **Never Commit Secrets**: Check for sensitive data
8. **Test Before Committing**: Ensure code works
```

**After (good):**

```markdown
Review diffs before staging, group related changes, and write clear commit messages. Commit often with focused changes.
```

Or simply **remove entirely** if the advice is obvious.

---

## Troubleshooting Format

**Before (bad):**

```markdown
### "Git not found" Error

**Cause**: Treq cannot find Git on your system PATH.

**Solution**:

1. Verify Git is installed: `git --version`
2. If Git is installed but not in PATH:
   - **macOS**: Restart Terminal after installing Git
   - **Linux**: Ensure `/usr/bin/git` exists
   - **Windows**: Reinstall Git and check "Add to PATH"
```

**After (good):**

```markdown
**"Git not found"**: Verify Git is installed (`git --version`). Ensure it's in your PATH—restart Terminal on macOS, or reinstall Git with "Add to PATH" on Windows.
```

---

## Reference Example

Here's a complete well-formatted file:

```markdown
---
sidebar_position: 2
---

# Creating Worktrees

_How to create and manage Git worktrees in Treq._

Worktrees let you work on multiple branches simultaneously, each in its own directory. Click **New Worktree** in the dashboard (or `Cmd+N`) to open the creation dialog.

## Creating a Worktree

Choose **Create new branch** and enter a name like `add-user-profile`. Treq applies your branch naming pattern (default: `treq/{name}`). Alternatively, select **From existing branch** to check out an existing local or remote branch.

Select a **base branch** (usually `main`) and optionally add a **plan title** to remember what you're working on. Click **Create Worktree**—Treq creates the directory, checks out the branch, and runs any configured post-create commands.

## Working in Your Worktree

Click **Open** on the worktree card to open a terminal session. The working directory is set to your worktree path. Make changes, run commands, and use Git normally. Treq detects changes and updates the dashboard automatically.

## Configuration

Configure branch naming patterns in Settings → Repository → Branch Pattern. Examples: `treq/{name}`, `feature/{name}`, or `{user}/{name}`. Post-create commands (like `npm install`) run automatically after creation.

## Troubleshooting

**"Branch already exists"**: Choose a different name or select the existing branch. **Worktree not appearing**: Use Settings → Rebuild Worktrees Database.

## Next Steps

- [Interface Overview](interface-overview) — Understand the UI
- [Staging and Committing](../core-workflows/staging-and-committing) — Commit changes
```

---

## Checklist Before Finishing

- [ ] File is under 80 lines (ideally 40-60)
- [ ] No bullet lists longer than 3 items
- [ ] No H3 or H4 headers
- [ ] No TypeScript/JSON/SQL code blocks
- [ ] No "What's happening?" explanatory sections
- [ ] No step-by-step numbered lists (convert to prose)
- [ ] No redundant "Best Practices" sections
- [ ] Bold terms are inline, not standalone
- [ ] Opening has italic one-liner description
- [ ] Ends with "Next Steps" linking 2-3 related pages
