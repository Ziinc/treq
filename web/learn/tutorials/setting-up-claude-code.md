---
sidebar_position: 1
---

# Setting Up Claude Code

Install Claude Code, connect it to VS Code, and ship your first feature using planning mode, file references, and project instruction files.

## What You'll Build

By the end of this tutorial you will have:

- Claude Code installed and authenticated on your machine
- The Claude Code VS Code extension connected to your editor
- A small `formatDate` utility added to a sample project
- Tests passing for that utility
- `CLAUDE.md` and `AGENTS.md` files that give Claude persistent project context

This is a realistic first workflow: plan the change, review the plan, implement it, run tests, and leave behind instruction files so the next session starts with the right context.

## Before We Begin

You need:

- A computer running macOS, Windows, or Linux
- [VS Code](https://code.visualstudio.com/) installed
- A terminal you can run commands in
- A [Claude account](https://claude.ai/) with Claude Code access
- A local Git repository to work in (a personal project or a fresh clone is fine)

This tutorial uses a simple TypeScript project as the example. If your repo uses a different stack, the Claude Code workflow is the same; swap the test command for whatever your project uses.

## Let's Build It

### Step 1: Install Claude Code

Open a terminal and install the Claude Code CLI:

```bash
npm install -g @anthropic-ai/claude-code
```

Verify the install:

```bash
claude --version
```

You should see a version number printed. If the command is not found, confirm your npm global bin directory is on your `PATH`.

Authenticate:

```bash
claude
```

Follow the browser sign-in flow. When authentication succeeds, Claude Code returns you to the terminal ready for prompts.

### Step 2: Install the VS Code extension

1. Open VS Code.
2. Open the Extensions view (`Cmd+Shift+X` on macOS, `Ctrl+Shift+X` on Windows/Linux).
3. Search for **Claude Code** and install the official Anthropic extension.
4. Reload VS Code if prompted.

Open the Claude Code panel with `Cmd+Esc` (macOS) or `Ctrl+Esc` (Windows/Linux). You should see the prompt box at the bottom of the panel.

If the panel does not appear, open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`), run **Claude Code: Open Panel**, and confirm you are signed in.

### Step 3: Open your project and add instruction files

Open your repository folder in VS Code.

Create an `AGENTS.md` file at the project root. This is the tool-agnostic instruction file other AI agents can also read:

```markdown
# Project instructions

## Commands
- Install dependencies: `npm install`
- Run tests: `npm test`
- Typecheck: `npm run typecheck`

## Code style
- Use TypeScript strict mode
- Prefer small, testable functions
- Add unit tests for new utilities

## Workflow
- Plan non-trivial changes before editing files
- Run tests before considering a task complete
```

Create a `CLAUDE.md` file that imports the shared instructions and adds Claude-specific guidance:

```markdown
@AGENTS.md

## Claude-specific notes
- When adding utilities, place them in `src/lib/`
- Match existing test patterns in `test/`
- Ask before modifying CI or deployment config
```

Claude Code reads `CLAUDE.md` at the start of every session. Importing `AGENTS.md` keeps one source of truth if your team also uses other coding agents.

Run `/init` in the Claude Code panel if you want Claude to scan the repo and suggest additions to `CLAUDE.md` based on what it finds.

### Step 4: Start in Plan mode

Click the **mode indicator** at the bottom of the Claude Code prompt box and select **Plan**.

Plan mode is read-only. Claude can explore your codebase and write a plan, but it will not edit files until you approve the plan.

Prompt Claude:

```text
I need a formatDate utility in src/lib/formatDate.ts that formats ISO date strings
as "Jan 5, 2026". Add tests in test/formatDate.test.ts. Plan the implementation
before making any changes.
```

Claude reads relevant files and produces a plan. VS Code opens the plan as a Markdown document.

Review the plan:

- Does it touch the right files?
- Does it mention running tests?
- Is the scope small enough for a first change?

Edit the plan directly if something is wrong. Inline comments and edits in the plan document are picked up when you approve it.

When the plan looks right, approve it so Claude can move to implementation.

### Step 5: Switch to Edit automatically and implement

Click the mode indicator and switch to **Edit automatically** (also called `acceptEdits`).

In this mode Claude applies file edits without asking for each one. Shell commands and sensitive operations still prompt for approval.

Tell Claude to execute the approved plan:

```text
Implement the plan. Run the test suite when you are done.
```

Claude creates or edits files. VS Code shows a side-by-side diff for each change. You can accept, reject, or edit the proposed content before accepting.

**Verify success:** confirm these files exist and look reasonable:

- `src/lib/formatDate.ts`
- `test/formatDate.test.ts`

### Step 6: Reference specific files and line ranges

Sometimes you want Claude to focus on one area instead of re-exploring the repo.

Type `@` in the prompt box to mention a file. Claude Code supports fuzzy matching, so `@formatDate` is enough to find `src/lib/formatDate.ts`.

Select lines 1–10 in `src/lib/formatDate.ts`, then press `Option+K` (macOS) or `Alt+K` (Windows/Linux). Claude inserts a reference like `@src/lib/formatDate.ts#1-10` into your prompt.

Ask for a targeted change:

```text
@src/lib/formatDate.ts#1-10 Add a guard for invalid date strings and return null
instead of throwing. Update the tests accordingly.
```

Claude limits its attention to the referenced code. This is faster and more precise than describing the file path in prose.

### Step 7: Run tests and fix failures

If Claude did not already run tests, prompt:

```text
Run npm test and fix any failures.
```

Watch the terminal output in the Claude Code panel. All tests should pass.

**Verify success:** your test command exits with code 0 and the new `formatDate` tests are green.

### Step 8: Review the diff and commit

Switch back to **Manual** mode for the final review. Manual mode asks permission before each action, which is appropriate when you are inspecting work before it lands.

Ask Claude:

```text
Show me a summary of every file you changed in this session.
```

Review the full diff in VS Code. When you are satisfied, commit the change yourself or ask Claude to draft a commit message:

```text
Suggest a conventional commit message for these changes.
```

You now have a working utility, passing tests, and instruction files that persist for the next session.

## What Just Happened?

You ran a complete agent-assisted development loop:

1. **Instruction files** (`AGENTS.md`, `CLAUDE.md`) gave Claude persistent context about commands, style, and scope.
2. **Plan mode** let you agree on the approach before any files changed.
3. **Edit automatically mode** sped up implementation while keeping diffs visible in VS Code.
4. **@-mentions and line references** narrowed Claude's attention to specific code.
5. **Manual mode** brought approval prompts back for the final review.

The permission mode you choose shapes how much supervision each step needs. Plan mode is for thinking; edit mode is for doing; manual mode is for reviewing.

## Experiment Further

Try these small variations on the workflow you just completed:

1. **Re-run the same task in Plan mode only.** Ask Claude to plan a second utility without implementing it. Compare how much easier review is when no files have changed yet.

2. **Use a selection instead of an @-mention.** Highlight a function in the editor, toggle whether Claude can see the selection (eye icon in the prompt footer), and ask for a refactor. Notice when visible selection is faster than typing a file path.

3. **Add a scoped rule.** Create `.claude/rules/tests.md` with instructions that apply only to test files. Ask Claude to add another test and check whether it follows the rule without you repeating it in the prompt.

4. **Break a test on purpose.** Switch to Edit automatically, ask Claude to fix the failing test, and watch how it uses terminal output compared to Plan mode exploration.

## Where To Go Next

- [What are Coding Agents?](/learn/concepts/ai-engineering/coding-agents) — how autonomous agents plan and execute multi-step tasks
- [What is Human-in-the-Loop Development?](/learn/concepts/ai-engineering/human-in-the-loop-development) — where human review fits in agent workflows
- [AI Feature Development Workflow](/learn/workflows/ai/ai-feature-development) — a goal-oriented workflow for building features with AI
- [AI-assisted Software Engineering](/learn/concepts/ai-engineering/ai-assisted-software-engineering) — the broader practice behind tools like Claude Code
- [Claude Code VS Code documentation](https://code.claude.com/docs/en/vs-code) — official reference for extension settings and keyboard shortcuts

## Best Practices, Tips, and Tricks

### Choosing the right permission mode

| Mode | Use when | Avoid when |
| --- | --- | --- |
| **Plan** | Exploring an unfamiliar codebase, designing a multi-file change, or agreeing on approach before edits | You already know exactly what to change and want speed |
| **Edit automatically** | Implementing an approved plan, iterating on code you are actively reviewing | Working in an unfamiliar repo, touching security-sensitive code, or running untrusted third-party code |
| **Manual** | Final review, sensitive files, production config, or learning how Claude approaches a problem | Long implementation sessions where constant approval prompts slow you down |
| **Auto** | Long-running tasks you have scoped tightly and reviewed the plan for | New projects, unfamiliar code, or work you have not planned first |

**Auto mode** is a research preview that auto-approves tool calls with background safety checks. It can reduce prompt fatigue on long tasks, but it is a poor default for your first session in a repo. Start with Plan, then move to Edit automatically once you trust the direction.

### Writing good `AGENTS.md` and `CLAUDE.md` files

- Keep the root `AGENTS.md` focused on commands, architecture, and team conventions.
- Use `CLAUDE.md` to import shared rules (`@AGENTS.md`) and add Claude-specific notes only.
- Split large instruction sets into imported files (for example `docs/agent/testing.md`) instead of one giant root file.
- Prefer concrete commands (`npm test`, `cargo test`) over vague guidance ("run the tests").
- Update instruction files when Claude makes a repeated mistake. That correction pays off in every future session.

### Prompting and review habits

- Scope tasks to one logical change. "Add formatDate with tests" succeeds more often than "improve all date handling."
- Review diffs, not just test output. Passing tests do not guarantee the right design.
- Use @-mentions to point at examples: `@src/lib/existingUtil.ts Follow this pattern for the new helper.`
- When a plan is wrong, edit the plan document instead of adding corrective prompts mid-implementation.
- End sessions with a short summary prompt so you can verify nothing unexpected landed.

### Documentation workflow

- Ask Claude to draft docs in Plan mode first: README sections, ADRs, or inline docstrings.
- Reference existing docs with @-mentions so tone and structure stay consistent.
- Store durable project conventions in `AGENTS.md` rather than chat history.
- For user-facing docs, review for accuracy yourself. Claude is strong at structure and clarity but can state plausible-sounding details that are wrong.

### Common pitfalls

- Skipping Plan mode on multi-file features and then reviewing a large diff you did not shape.
- Leaving Edit automatically on while exploring a new repository.
- Duplicating the same instructions in `AGENTS.md`, `CLAUDE.md`, and every prompt.
- Treating a green test run as the only gate before merge.
- Letting instruction files grow without pruning. Bloated context files reduce compliance with the rules that matter.
