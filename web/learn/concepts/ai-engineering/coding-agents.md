---
sidebar_position: 3
---

# What are Coding Agents?

A coding agent is an AI system that autonomously executes software engineering tasks — writing code, running tests, reading files, and iterating on its own output — in response to a high-level goal rather than step-by-step instructions.

## How coding agents work

A coding agent is typically built on a large language model (LLM) given access to tools: a code editor, a shell, a file system, and sometimes a browser or external APIs. Given a task like "add pagination to the user list endpoint," the agent:

1. Reads the relevant files to understand the codebase
2. Plans an approach
3. Writes and edits code
4. Runs tests to check its work
5. Fixes failures and iterates
6. Reports completion or asks for clarification when stuck

This loop runs autonomously. The developer doesn't watch each step; they describe the goal, let the agent run, and review the result.

## What distinguishes an agent from a chatbot

A chatbot generates text in response to prompts. A coding agent takes actions — it reads real files, executes real commands, writes to the real codebase. The distinction matters because an agent's mistakes have real consequences and its successes produce real output.

| Chatbot | Coding Agent |
|---|---|
| Generates code as text | Writes code to actual files |
| You copy-paste output | Output is already in the codebase |
| Stateless across turns | Maintains state across a multi-step task |
| No tool access | File system, shell, browser access |

## Current examples

Widely used coding agents include Claude Code, Cursor Agent Mode, GitHub Copilot Workspace, Devin, and OpenAI Codex. These vary in how much autonomy they exercise, how they handle failures, and how they integrate into review workflows.

## Limitations

Coding agents have meaningful weaknesses:

- **Context limits**: agents can only read so much code at once; large codebases require careful scoping
- **Hallucination**: agents can invent plausible but non-existent APIs, libraries, or functions
- **Cascading errors**: an early wrong assumption can propagate through a task before the agent detects the problem
- **No product judgement**: agents implement what they're asked; they can't evaluate whether the feature is the right one to build

These limitations are why human review remains essential even when agents handle implementation.

## Related concepts

- [What is Human-in-the-Loop Development?](./human-in-the-loop-development)
- [What is Agent Orchestration?](./agent-orchestration)
- [What is AI Code Review?](./ai-code-review)
