---
sidebar_position: 2
---

# AI Feature Development Workflow

A structured workflow for building new features using a coding agent — from scoping and task setup through implementation, review, and merge.

## Overview

AI-assisted feature development works best when the human defines the boundaries clearly and the agent handles execution within them. The main risk is an agent that drifts — implementing more than was asked, choosing architectural patterns that don't fit the codebase, or producing untestable code. A workspace-per-task model combined with iterative review keeps that risk contained.

## Step 1 — Define the feature scope

Before opening an agent session, write a clear task description that includes:

- **What** the feature does (user-facing behaviour)
- **What it doesn't do** (explicit exclusions prevent scope creep)
- **Where** in the codebase it belongs (file paths, modules, relevant conventions)
- **How to verify it** (acceptance criteria or test scenarios)

The more specific the description, the more focused the agent's output. Vague prompts produce sprawling implementations.

## Step 2 — Create an isolated workspace

Create a dedicated workspace for the feature before starting the agent. This gives the agent a sandboxed environment: it can read and write freely without touching your main checkout or other in-progress work.

Name the workspace after the feature or task ID so it's easy to identify when reviewing.

## Step 3 — Run the agent

Point the agent at the workspace and give it the task description. Let it run to completion before reviewing. Interrupting mid-task and redirecting often produces incoherent output — it's better to let the agent finish, review the diff, and then give specific feedback for a second pass.

If the agent asks clarifying questions early, answer them. If it asks mid-task, use judgement: a quick answer unblocks it; a question about fundamental design is worth pausing to address properly.

## Step 4 — Review the diff

When the agent reports completion, review the diff in the workspace before running tests. Look for:

- **Scope**: did it implement only what was asked?
- **Architecture**: does the approach fit the existing codebase patterns?
- **Edge cases**: are error paths, empty states, and input validation handled?
- **Tests**: are the new behaviours covered? Are the tests meaningful or just passing trivially?

Leave inline comments on specific lines rather than rewriting the task description. Agents act on concrete feedback more reliably than re-stated goals.

## Step 5 — Iterate

Send the agent back with your comments. For small feedback (rename a variable, add a missing check), one pass is usually enough. For larger issues (wrong abstraction, missing module), break the feedback into prioritised chunks and iterate.

Limit iterations to what's genuinely needed. If the agent's approach is fundamentally wrong, it's sometimes faster to discard and re-prompt with a clearer constraint than to iterate from a bad foundation.

## Step 6 — Verify and merge

Once the diff is clean, run the test suite and any manual verification steps. If it passes, merge the workspace into the target branch. The workspace can then be deleted; its history lives in the branch.

## Tips

- Keep features small enough to review in one session. A feature that would take a developer two days to implement will produce a diff too large to review meaningfully in one pass.
- Pin the agent to specific files when the feature is narrow. Telling it "modify only `src/api/users.ts` and its tests" reduces the chance of unintended side effects.
- Save your task descriptions. A well-written description becomes reusable documentation and a useful reference if the feature needs revisiting.

## Related workflows

- [AI Code Review Workflow](./ai-code-review)
- [Human-in-the-Loop Review Workflow](/learn/workflows/git/human-in-the-loop-review)
- [Parallel Development Workflow](/learn/workflows/git/parallel-development)
