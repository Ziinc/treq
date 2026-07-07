---
sidebar_position: 2
---

# React Development Workflow

A workflow for using AI agents to build and iterate on React applications — covering component generation, state management, and the review practices that keep UI code maintainable.

## Overview

React codebases have predictable structure — components, hooks, context, and tests — which makes them a good fit for AI-assisted development. Agents navigate the component tree effectively, generate typed props interfaces, and produce tests using standard libraries. The main risks are inconsistent component architecture, styling drift from established patterns, and generated hooks that introduce subtle re-render bugs.

## Setting up agents for React work

Before running an agent on a React codebase, give it orientation:

- **Component library**: are you using shadcn/ui, Radix, MUI, or custom components? The agent should use existing primitives rather than creating new ones.
- **Styling approach**: CSS modules, Tailwind, styled-components, or plain CSS? Inconsistency here produces visual debt that's tedious to clean up.
- **State management**: Zustand, Redux, Jotai, React Query, or local state? Name the pattern for the task at hand so the agent doesn't introduce a different one.
- **Testing library**: React Testing Library conventions (prefer `getByRole`, `userEvent`) or a different approach?

A brief context block at the start of the task prompt saves multiple correction iterations.

## Feature development: new components

When asking an agent to build a new component:

1. **Describe the component's contract**: its props, what it renders, and what events it emits. Be specific about types — `onSubmit: (data: FormData) => void` is better than "a submit handler."
2. **Name an existing component to use as a reference**: "match the pattern used in `UserCard.tsx`" gives the agent a real example of the codebase's conventions.
3. **Specify co-location**: where does the component file live? Where do its tests live? Does it get a Storybook story?

Review the generated component for:

- **Prop drilling**: has the agent passed props through multiple layers that should use context or a state manager?
- **Effect correctness**: any `useEffect` should have a correct dependency array and a cleanup function if it sets up subscriptions or timers.
- **Memoisation**: `useMemo` and `useCallback` should be present only where there's a real performance reason, not speculatively.
- **Key props**: any list rendering should have stable, unique keys — not array indices.

## Bug fixing in React

React bugs often manifest in the UI without an obvious stack trace. Give the agent:

- The component name and the visible symptom ("the dropdown closes immediately after opening")
- The relevant component file and any hooks it calls
- The browser console output if errors are present

Ask the agent to identify the cause before writing a fix. Common React bug categories to watch for:

- **Stale closure**: a callback captures a value from a previous render
- **Infinite re-render**: a state update in an effect without a proper dependency array
- **Missing cleanup**: an async operation that updates state after the component unmounts
- **Identity instability**: an object or array created inline in JSX that causes a child to re-render on every parent render

## Refactoring React code

Common React refactoring tasks for agents:

- Extracting a large component into smaller ones
- Converting class components to function components with hooks
- Migrating from one state management library to another
- Replacing inline styles with a CSS module or Tailwind classes

For any refactoring, ensure the component has tests before the agent touches it. React Testing Library tests that exercise user behaviour (click, type, submit) are the most reliable safety net — they survive implementation changes that break implementation-detail tests.

## Reviewing AI-generated React code

Beyond logic review, check:

- **Accessibility**: does interactive UI have correct ARIA attributes, keyboard navigation, and focus management?
- **Error boundaries**: do new features have error boundaries that prevent a component failure from crashing the whole page?
- **Loading states**: does the component handle loading, empty, and error states gracefully, or does it assume data is always present?

## Related workflows

- [AI Feature Development Workflow](/learn/workflows/ai/ai-feature-development)
- [AI Refactoring Workflow](/learn/workflows/ai/ai-refactoring)
- [Human-in-the-Loop Review Workflow](/learn/workflows/git/human-in-the-loop-review)
