---
sidebar_position: 2
---

# React Development Workflow

A workflow for using AI agents to build and iterate on React applications — covering component generation, state management, and the review practices that keep UI code maintainable.

## Introduction

Building React applications with AI agents reduces the time spent on predictable, structural work — scaffolding components, writing prop interfaces, generating tests, and migrating between patterns — so engineers can focus on product decisions and architecture. This workflow is for frontend engineers and full-stack teams working on React TypeScript codebases who want to integrate AI assistance without accumulating hook bugs, styling inconsistencies, or accessibility debt.

React is a natural fit for AI-assisted development because its unit of composition — the component — has a clear, declarative contract: props in, rendered output and events out. That explicitness means agents can generate well-typed components from a brief description, follow an existing component as a reference, and produce React Testing Library tests that exercise real user behaviour. After reading this workflow, you will be able to orient an agent to your codebase's specific conventions before each task, run a structured review pass on generated UI code, and use agents for high-leverage refactoring tasks like class-to-function component migrations and state management library moves.

## Understanding the Concept

React codebases are organised around components, hooks, context, and tests — a structure agents navigate effectively when given enough orientation. The key mental model is that an agent working in React needs to understand four things before it starts: what primitives already exist (component library), how styles are applied (styling approach), where shared state lives (state management), and how code is verified (testing conventions). Without this context, an agent will make locally reasonable choices that drift from the codebase's patterns — creating a new unstyled component when shadcn/ui primitives already cover the use case, or reaching for `useState` where the codebase uses Zustand.

TypeScript helps significantly here. A well-typed codebase gives agents accurate information about what props components accept, what hooks return, and what events emit. Agents read type definitions and use them to generate consistent code; type errors after generation are clear signals about mismatches. This makes TypeScript React codebases more reliable targets for agent work than untyped ones.

Where React creates friction for agents is in the hooks model. The rules of hooks — referential stability, dependency arrays, cleanup functions — are not enforced by the TypeScript compiler. An agent can generate code that compiles and renders correctly in the happy path but introduces a stale closure, an infinite re-render loop, or a memory leak from a missing cleanup. These bugs require understanding the React rendering model, which agents sometimes approximate rather than apply precisely. Memoization is a related blind spot: agents often add `useMemo` and `useCallback` speculatively, adding complexity without a measurable performance benefit.

## Applying It in Practice

Before each task, give the agent a brief orientation block in the prompt. Name the component library in use (shadcn/ui, Radix, MUI, or custom), the styling approach (Tailwind, CSS modules, styled-components), the state management pattern for this task (Zustand store, React Query, local state), and the testing conventions (React Testing Library with `getByRole` and `userEvent`, or otherwise). A few sentences here prevents multiple correction iterations later.

For a new component, describe its contract precisely: what props it accepts with TypeScript types, what it renders, and what events it emits. `onSubmit: (data: FormData) => void` is more useful than "a submit handler." Then name one existing component in the codebase as a reference — "match the structure of `UserCard.tsx`" gives the agent a real example of how the codebase organises props, handlers, and rendering. Specify co-location explicitly: where the component file lives, where its tests go, whether it needs a Storybook story.

Once the agent produces a component, apply this review pass in order. Check hook dependency arrays first — any `useEffect` should list every value it reads from the outer scope, and any effect that sets up a subscription or timer must return a cleanup function. Check for prop drilling — if the agent has threaded a prop through three layers to reach a deep child, that is a signal to use context or a state manager instead. Look at key props in any list rendering; array indices as keys cause incorrect reconciliation when items are added, removed, or reordered, and agents reach for them by default. Review memoization use: `useMemo` and `useCallback` are only worth the complexity when there is a measurable render performance problem or a referential-equality requirement, not as a precaution. Finally, audit accessibility — interactive elements need correct ARIA attributes, keyboard navigation, and focus management, which agents frequently produce only partially. Add error boundaries around any new features that might fail at runtime so that a component error does not crash the entire page.

For refactoring tasks — converting class components to function components with hooks, migrating from one state management library to another, replacing inline styles with Tailwind — always ensure tests exist before the agent touches the code. React Testing Library tests that drive user behaviour (click, type, submit, navigate) survive implementation changes that break implementation-detail tests, making them the most reliable safety net for agent-driven refactoring.

## Engineering Decision Guide

AI assistance adds the most value in React for structural, pattern-following work: generating new components from a spec, scaffolding test files, and performing large but mechanical refactors like class-to-function conversions or state management migrations across many files. These tasks are time-consuming, repetitive, and the feedback loop is fast because TypeScript and the browser provide immediate error signals. Agents are also effective at reviewing existing components for accessibility gaps and suggesting the right ARIA roles — a review task that is tedious to do manually at scale.

The trade-offs are concentrated in hook correctness and styling consistency. An agent can produce a component that looks correct in code review but behaves incorrectly at runtime due to a stale closure or a missing dependency in a `useEffect`. Reviewers who are not fluent in React's rendering model may approve buggy hook code without catching it. Similarly, if the agent is not precisely oriented to the styling approach, it will mix patterns — Tailwind classes in a CSS Modules codebase, inline styles in a Tailwind codebase — creating visual debt that accumulates silently across many PRs.

AI assistance adds risk when the task involves complex stateful UI behaviour — multi-step forms with cross-field validation, drag-and-drop with optimistic updates, real-time collaboration state — where the interaction between rendering cycles and user events is subtle. In these cases, sketch the state machine or interaction flow yourself before delegating implementation.

## Scaling & Operational Considerations

The failure modes that accumulate in AI-generated React code over time are usually not single bugs but patterns: agents that consistently omit cleanup functions in effects, consistently use index keys in lists, or consistently skip accessibility attributes. Establish a code review checklist specific to your codebase and apply it to every agent-generated PR, not just spot checks.

Stale closures are the hardest to catch in review because the code looks correct. The symptom is a callback that uses a value from a previous render — most often in event handlers passed as props to deeply nested components. The `eslint-plugin-react-hooks` exhaustive-deps rule catches a significant fraction of these automatically; run it as part of CI to convert a human review burden into a lint gate.

Security in React is a targeted concern around `dangerouslySetInnerHTML`. Agents may use it to render HTML content from an API response without sanitisation. Search generated code for `dangerouslySetInnerHTML` and ensure any content rendered that way is sanitised at the source or with a library like DOMPurify before it reaches the DOM. Also review any dynamic `src` or `href` attributes that could inject a `javascript:` URL from user-controlled data.

Long-term, AI-generated React components are maintainable when they follow the codebase's conventions precisely. Components that introduce a new state management pattern, a new styling approach, or a new test structure create a second set of conventions that subsequent agents and engineers must understand separately from the rest of the codebase. The orientation step at the start of each task is the primary tool for preventing that drift.

## Next Steps

- [AI Feature Development Workflow](/learn/workflows/ai/ai-feature-development) — the general framework for running an AI agent on a feature task end to end
- [AI Refactoring Workflow](/learn/workflows/ai/ai-refactoring) — how to structure large refactoring tasks for agents, including checkpoints and rollback strategies
- [Human-in-the-Loop Review Workflow](/learn/workflows/git/human-in-the-loop-review) — review process for AI-generated code, including what to delegate and what to inspect manually
- [Tauri Development Workflow](./tauri-development) — adds the Rust backend and IPC layer for teams building desktop apps on top of a React frontend
