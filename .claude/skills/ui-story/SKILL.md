---
name: ui-story
description: >-
  Create or update Storybook stories that mount a treq React component as a
  presentational component, driven purely by props/args (no live jj repo, no
  Tauri IPC, no NAPI). Use when the user runs /ui-story, asks to "add a
  story", "storybook this component", "preview this component in
  storybook", or asks for a component to get a Cloudflare Pages preview link
  on its PR. Scope is app components today (src/components/**,
  src/components/ui/**) — the long-term goal is a components package shared
  between the app (src/) and the marketing/docs site (web/), so prefer
  patterns that don't hard-code app-only assumptions when a component is
  genuinely presentational.
---

# ui-story (Storybook stories for treq components)

## What this skill is for

Storybook here exists to let a reviewer *see* a changed presentational
component in isolation — different props, different variants, light/dark —
without running the full Tauri app or a real jj repo. It is not a
replacement for `/app-qa`, which verifies real app behavior against a real
repo. If the component you're working on can't be meaningfully rendered
without live app state (a `useQuery` hook, `invoke()` calls, `ThemeProvider`
context that reads settings from the Rust backend, etc.), that's a signal
it isn't presentational yet — either stub/inject that dependency via props,
or skip Storybook for it and rely on `/app-qa` instead.

## Setup already in place

- `.storybook/main.ts` — stories glob is `src/**/*.stories.@(ts|tsx)`,
  framework is `@storybook/react-vite`.
- `.storybook/preview.tsx` — imports `src/index.css` (Tailwind + the app's
  CSS variables), and adds a toolbar **Theme** control that toggles the
  `.dark` class on `<html>`, matching how `useTheme` applies dark mode in
  the real app. Stories automatically get real treq styling in both themes
  without needing `ThemeProvider`.
- `npm run storybook` — dev server on port 6006.
- `npm run build-storybook` — static build to `storybook-static/` (what CI
  deploys).
- Example: `src/components/ui/button.stories.tsx`.

## Where stories live

Colocate the story next to the component it documents:
`src/components/ui/button.tsx` → `src/components/ui/button.stories.tsx`.
Same for components under `src/components/**` (e.g.
`src/components/WorkspacePicker.tsx` →
`src/components/WorkspacePicker.stories.tsx`).

## Writing a story

1. **Read the component first.** Identify its props interface and which
   props are purely presentational (strings, booleans, enums, render
   callbacks) vs. which pull in app state (hooks like `useTheme`,
   `useWorkspace`, TanStack Query, or `invoke()` from `src/lib/api`).
2. **If the component takes app-state hooks directly** (not via props),
   don't fight it inside the story. Prefer, in order:
   - Check if the component already separates a presentational piece from
     a container (e.g. `FooView` vs `Foo`) — story the presentational one.
   - If no such split exists and the component is a good candidate for one
     (its own logic is small and the hook usage is incidental), propose
     extracting a presentational subcomponent, but confirm with the user
     before doing a nontrivial refactor — don't do it silently as a side
     effect of "just adding a story."
   - Otherwise, mock only what's needed via a decorator (e.g. wrap in a
     minimal context provider with fixed values) rather than pulling in the
     real provider stack.
3. **Model args on the real prop types.** Use `satisfies Meta<typeof
   Component>` and derive `argTypes` from the actual variant/size/enum
   unions in the component (see `button.stories.tsx` for the pattern with
   `class-variance-authority` variants) — don't invent props that don't
   exist.
4. **Cover the states that matter for review**, not every permutation:
   default, the visually distinct variants, a disabled/error/empty state if
   the component has one, and — for anything text-heavy — a long-content
   story to catch overflow/wrapping bugs. Prefer one story per meaningful
   visual state over a combinatorial matrix.
5. **Use `tags: ["autodocs"]`** on the meta so Storybook's docs page is
   generated for free.
6. Do not add global decorators or providers to `.storybook/preview.tsx`
   for a single component's needs — keep shared setup shared, keep
   component-specific mocking local to that story file.

## Verifying

Run `npm run storybook` and check the component renders with real
Tailwind styling in both the light and dark toolbar states, or run `npm run
build-storybook` (fast, no dev server) and confirm it completes without
errors — that's what CI does before deploying the preview.

## Shared-components long-term note

`web/` (the Docusaurus marketing/docs site) does not yet share components
or Tailwind config with the app. When a component you're storying is
genuinely generic UI (not treq-specific business logic) and you notice it
duplicates something in `web/`, mention it, but don't attempt the
extraction into a shared package as part of a story-writing task — that's
a separate, larger migration.
