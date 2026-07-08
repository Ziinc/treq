---
sidebar_position: 3
---

# What are Coding Agents?

## Introduction

A coding agent is an AI system that executes software engineering tasks autonomously — reading files, writing code, running tests, and iterating on its own output — in response to a high-level goal rather than step-by-step instructions. Unlike a chatbot that generates code as text for a human to copy and paste, a coding agent takes actions directly in a real codebase with real consequences.

The problem this solves is implementation throughput. A developer who specifies a task clearly should not have to do every mechanical step of carrying it out. A coding agent handles the execution: navigating the codebase, writing the implementation, running the tests, fixing the failures, and reporting back when done. The developer reviews the result rather than producing every line. This shifts the human role from producer to director and reviewer.

This article is for developers evaluating or using coding agents for the first time, and for teams designing workflows around agent output. After reading, you will understand how agents differ from simpler AI tools, how they plan and execute tasks mechanically, what their context window limitations mean in practice, what their characteristic failure modes are, and how to think about the trust model for what an agent produces.

## Understanding the Concept

The distinction between a coding agent and a chatbot is not about the underlying model — it is about what the system does with the model's output. A chatbot generates text. A coding agent takes actions: it calls tools, reads real files, writes to the filesystem, executes shell commands, and maintains state across a multi-step task. That action-taking is what makes an agent's mistakes have real consequences and its successes produce real, integrated output rather than code waiting to be pasted.

An agent is typically built by giving a large language model access to a set of tools: a file editor, a shell, a code search interface, and sometimes external APIs. Given a task, the model decides which tools to call and in what order, using the results of each action to decide the next step. This is the planning loop: observe the current state, decide on an action, take the action, observe the result, repeat. The loop runs until the task is complete or the agent reports that it is stuck.

| | Chatbot | Coding Agent |
|---|---|---|
| Output form | Code as text | Code written to actual files |
| Integration | You copy-paste | Output is already in the codebase |
| State | Stateless across turns | Maintains state across a multi-step task |
| Tool access | None | File system, shell, test runner |
| Failure consequences | Textual | Real codebase impact |

Context window limitations are a fundamental constraint that shapes how agents work. A model can only hold so much code in context at once. On a large codebase, it cannot read every relevant file simultaneously, so it must choose which files to read and rely on search to find relevant context. If it reads the wrong files — misses a relevant module, overlooks an existing pattern, does not find the function that already does what it is about to reimplement — it works with an incomplete picture and produces output that reflects that gap. Narrow task scoping helps because a narrower task requires less context to execute correctly.

Widely used coding agents today include Claude Code, Cursor in agent mode, GitHub Copilot Workspace, and Devin. These vary in how much autonomy they exercise, how they handle failures and dead ends, and how tightly they integrate into review workflows — but they share the same fundamental architecture: a large language model given tools and a task, running an action loop until completion.

## Applying It in Practice

A practical agent interaction starts with a clear task description scoped to a manageable area of the codebase. "Add pagination to the user list endpoint — the endpoint lives in `api/users.py`, the model is in `models/user.py`, and we use the pagination helper from `utils/pagination.py`" gives the agent a starting point and a scope. The agent still reads the code and forms its own understanding, but the scoping prevents it from wandering into unrelated areas and making changes that were not requested.

Once running, an agent typically follows this sequence: reads the relevant files to understand the codebase, formulates a plan, writes the implementation, runs the existing tests, fixes any failures, checks whether new tests are needed, writes them if so, and signals completion. Each step produces observable tool calls — file reads, edits, shell commands — that you can watch in real time if the agent surfaces them. This transparency is useful for catching wrong assumptions early before they compound.

Reviewing agent output effectively means reading the diff, not just running the tests. Tests the agent wrote may pass because the agent understood the task the same way in both the implementation and the test cases — meaning both contain the same misunderstanding. Reading the diff catches logical errors that testing misses. Things to check specifically: does the implementation handle edge cases the task description did not mention, are there new dependencies introduced without discussion, does the code follow the codebase's existing patterns, and are there any security-relevant changes the agent made without flagging them?

When an agent gets stuck — produces an error it cannot resolve, enters a loop of failing tests, or asks for clarification — intervening early saves time. Providing additional context, pointing to a relevant file the agent missed, or narrowing the scope of the remaining work usually breaks the deadlock faster than letting the agent continue to iterate on a broken approach.

## Engineering Decision Guide

Coding agents offer the largest throughput gains on tasks that are well-defined, in areas with good test coverage, and involve implementation patterns the model has strong training signal for — REST API patterns, standard CRUD operations, common framework idioms, migration generation, test writing. For these tasks, an agent can produce a working implementation in minutes that would take a developer an hour, and the review overhead is modest because the output is mostly right.

The trade-offs are significant outside that zone. Novel algorithmic problems, complex architectural decisions, highly idiosyncratic codebases, and security-critical code all produce less reliable agent output and higher review overhead. In these areas, agent assistance may slow things down rather than speed them up: the developer must understand the agent's approach, evaluate whether it is correct, and often revise substantially. The review cost can exceed the writing cost.

Do not use coding agents for tasks where you lack the expertise to review the output — if you cannot evaluate whether the agent's solution is correct, you cannot safely ship it. Avoid agents for security-critical code in unfamiliar areas, for architectural decisions that require product context the agent does not have, or for codebases so poorly documented that the agent cannot form a reliable model of what already exists. The risk in these cases is not that the agent will obviously fail — it is that it will confidently produce plausible-looking output that is wrong in ways you do not catch until later.

The alternative for high-risk or novel tasks is assisted development: a developer writes the code with AI help (autocomplete, chat-based Q&A) rather than delegating the task fully. This keeps the human in the driver's seat while still capturing AI acceleration for the mechanical parts. The engineering recommendation: use agents confidently for the well-defined, well-tested middle of your task queue; use assisted development for work where judgment and product context matter most.

## Scaling & Operational Considerations

Cascading errors are the failure mode most specific to agents and worth understanding explicitly. An agent that makes a wrong assumption early in a task — misidentifies what an existing function does, reads the wrong version of a schema, assumes a pattern that is only used in one file — propagates that error through subsequent steps. By the time it reports completion, the error has become structural and touches multiple files. Prevention is more effective than recovery: clear task scoping, pointing the agent to relevant files explicitly, and watching the early tool calls for signs of misunderstanding.

Hallucinated APIs are common and hard to catch in review. An agent may confidently call a method that does not exist, import a library using an interface from an older version, or use a configuration option that was deprecated. These errors produce runtime failures that tests may or may not cover. Making the agent run the full test suite after implementation — which most do by default — catches the obvious cases. Reading the diff catches the rest, particularly when the hallucinated usage looks syntactically plausible.

Agents working in parallel on the same codebase without isolation create conflicts that are expensive to resolve and, worse, can produce silent overwrites where one agent's changes replace another's without anyone noticing until something breaks. Each agent in a parallel workflow needs its own isolated environment — a Git worktree, a separate branch, or a sandboxed clone — so that their changes are independent until reviewed and merged intentionally.

Trust calibration is an ongoing process, not a one-time judgment. An agent that performs reliably on one class of tasks may be unreliable on another. Building a sense of where your specific agent tool is strong and where it tends to fail — from your own experience in your own codebase — is more useful than relying on benchmark numbers that reflect different codebases and task distributions.

## Next Steps

- [What is Human-in-the-Loop Development?](./human-in-the-loop-development) — the review framework that makes agent output safe to ship
- [What is Agent Orchestration?](./agent-orchestration) — coordinating multiple agents across concurrent parallel tasks
- [What are Git Worktrees?](/learn/concepts/git/git-worktrees) — the isolation primitive that makes parallel agent work safe
- [AI Feature Development Workflow](/learn/workflows/ai/ai-feature-development) — a practical workflow for using a coding agent to build features end to end
