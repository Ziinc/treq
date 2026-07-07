---
sidebar_position: 4
---

# What is AI Code Review?

AI code review is the use of AI models to inspect code changes and surface potential bugs, security vulnerabilities, style violations, and missed test cases — either as a complement to human review or as a first pass before human reviewers see the diff.

## What AI code review can catch

- **Bugs**: logic errors, off-by-one mistakes, null pointer dereferences, incorrect boundary conditions
- **Security issues**: SQL injection, XSS, unsafe deserialization, hardcoded credentials, overly permissive access control
- **Code quality**: overly complex functions, duplicate logic, poor naming, missing error handling
- **Test coverage**: changed logic that lacks corresponding tests, edge cases the existing tests don't cover
- **Documentation gaps**: public APIs or functions without docstrings, unclear variable names

## What AI code review doesn't replace

AI reviewers work from patterns in the diff. They don't have the product context, team conventions, or architectural understanding that a human reviewer brings. Things AI reviewers typically miss:

- Whether the change solves the right problem
- Whether the approach fits the team's longer-term architecture plans
- Subtle performance implications that require domain knowledge
- Whether naming or structure matches unwritten team conventions

AI code review is most effective as a first pass that catches mechanical issues before a human reviewer focuses on intent and architecture.

## How it fits into a development workflow

A common pattern is to run AI review automatically on every pull request, the same way CI runs tests. The AI leaves comments on the diff; the author addresses or dismisses them; human reviewers then focus on what the AI didn't cover.

This compresses the review cycle: obvious issues are caught early without blocking the human reviewer's time on them.

## AI review of AI-generated code

When coding agents generate code, AI code review becomes especially relevant. An agent may produce syntactically correct code with subtle logic errors or security gaps. Running AI review on agent output adds a layer of validation before the change reaches a human reviewer.

This creates a pipeline: agent writes → AI reviews → human approves → merge. Each step filters a different class of problem.

## Related concepts

- [What are Coding Agents?](./coding-agents)
- [What is Human-in-the-Loop Development?](./human-in-the-loop-development)
- [What is AI-Assisted Software Engineering?](./ai-assisted-software-engineering)
