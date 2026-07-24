---
name: app-qa
description: >-
  Visually verify treq UI/behavior changes by driving the real app (real jj repo via
  NAPI, real Rust dispatch, jsdom-rendered React) with @testing-library/user-event and
  capturing before/after screenshots through the Chromium rasterization harness in
  scripts/screenshot/. Use explicitly when the user runs /app-qa or asks to screenshot,
  QA, or visually check a behavior. ALSO use proactively, without being asked, right
  after implementing or modifying anything that changes rendered UI or user-facing
  interaction: components under src/components/**, hooks under src/hooks/**,
  src/lib/** helpers that affect rendering, or Tauri commands under
  src-tauri/src/commands/** and src-tauri/src/core/** that back a UI flow. Do this
  before telling the user the change is done. A PostToolUse hook
  (.claude/hooks/post-edit-app-qa.sh) injects a reminder for exactly this case — treat
  that reminder as the trigger to run this skill, not just a suggestion.
---

# App QA (screenshot-verified behavior checks)

## When to use

- User invokes `/app-qa`, optionally naming a flow or component ("app-qa the workspace
  picker", "app-qa the merge conflict banner").
- Proactively, immediately after an Edit/Write/MultiEdit that changes UI-affecting
  code — don't wait to be asked. If you see `additionalContext` from
  `post-edit-app-qa.sh` naming a changed file, that *is* the request.

## Ground rule: userEvent only, never fireEvent

Every interaction inside a spec must go through `@testing-library/user-event`
(`userEvent.setup()`, then `user.click`, `user.type`, `user.keyboard`, `user.hover`,
`user.tab`, ...). Never use `fireEvent` for driving the scenario.

`fireEvent` dispatches one synthetic DOM event. `userEvent` replays the sequence a
real user actually produces — pointerdown, focus, pointerup, click; or a real
per-character sequence of keydown/input/keyup for typing. Radix components, cmdk,
and treq's own focus/keyboard-shortcut handling key off that full sequence. A spec
that drives state with `fireEvent.click` can look green while the real app is broken
for a real user clicking the same button — it defeats the point of this skill.

## How the harness works

1. `createTestRepo()` (from `test/utils`, backed by the `treq-napi` addon) creates a
   real jj repository on disk, exactly like an integration test.
2. `render(<Dashboard/>)` (from `test/test-utils`) mounts the real React tree in
   jsdom, with Tauri's `invoke` replaced by real Rust dispatch
   (`test/setup.integration.ts`) — no mocked backend, no mocked ShowWorkspace,
   FileBrowser, ChangesDiffViewer, etc.
3. `captureDocument(document, { name })` (`scripts/screenshot/capture.ts`) serializes
   the live DOM, inlines the app's real compiled Tailwind CSS
   (`scripts/screenshot/build-css.mjs` output), and hands the resulting static HTML to
   headless Chromium (`playwright-core`, pinned to the pre-installed browser) purely
   to rasterize it into a PNG. jsdom itself never paints a pixel — Chromium is only
   there for the pixels.

Full background and design rationale for this harness live in the git history of
`scripts/screenshot/` and `vitest.screenshot.config.ts` — read those files if you need
more context than this skill gives.

## Steps

1. **Identify the behavior to verify.** From the user's ask, or from the changed
   file(s) named in the hook's `additionalContext`, work out which user-facing flow
   changed. Search `test/integration/**` and `test/*.test.tsx` for a scenario that
   already sets up the right repo/workspace state (`createTestRepo`, `createWorkspace`,
   `commitRepoFile`, etc.) and reuse that setup instead of inventing your own — it's
   already proven to work against the real backend.

2. **Write or extend a spec** under `scripts/screenshot/specs/<slug>.spec.tsx`. One
   spec per behavior/flow. If an existing spec already covers this flow, add capture
   steps to it rather than duplicating the repo setup in a new file. Shape:

   ```tsx
   import * as React from "react";
   import { it } from "vitest";
   import userEvent from "@testing-library/user-event";
   import { createTestRepo, openRepo } from "../../../test/utils";
   import { render, screen, within } from "../../../test/test-utils";
   import { Dashboard } from "../../../src/components/Dashboard";
   import { captureDocument } from "../capture";

   it("captures <the behavior>", async () => {
     const { repoPath } = createTestRepo(false);
     openRepo(repoPath);
     // ... real repo/workspace setup via test/utils + src/lib/api ...

     const user = userEvent.setup();
     render(<Dashboard />);

     await screen.findByTestId("show-workspace-header"); // or whatever signals "settled"
     await captureDocument(document, { name: "<slug>-01-before" });

     // Drive the flow — ONLY user.* calls, never fireEvent.
     await user.click(await screen.findByRole("button", { name: "..." }));
     await screen.findByText("..."); // wait for the resulting DOM change
     await captureDocument(document, { name: "<slug>-02-after" });
   }, 60000);
   ```

   `scripts/screenshot/specs/workspace-branch-switch.spec.tsx` is a worked example:
   opens the branch-switch modal via `user.click`, captures it open, clicks a branch,
   and captures the switched state. Copy its shape for new flows.

   Give every capture a numbered, descriptive `name` — that string becomes the PNG
   filename, so name it as `<slug>-<NN>-<what-it-shows>`.

3. **Run it.**
   - First run in a session, or after touching `src-tauri` / `crates/treq-napi`, or
     adding new Tailwind classes: `npm run screenshot` (rebuilds the NAPI addon,
     recompiles CSS, runs every spec — slow but complete).
   - Fast iteration on one spec once the addon/CSS are already built:
     `npx vitest run --config vitest.screenshot.config.ts scripts/screenshot/specs/<slug>.spec.tsx`
   - If only Tailwind classes changed (no Rust change): `npm run screenshot:css` first,
     then the targeted vitest run above.

4. **Look at the PNGs before saying the task is done.** They land in
   `scripts/screenshot/.generated/<name>.png` (gitignored, regenerated each run). Read
   each one with the Read tool (it's multimodal) and actually look — a spec whose
   assertions pass can still render a visibly broken layout, a missing state, or wrong
   copy. That's a real bug to fix, not a false alarm.

5. **Show the result.** Use SendUserFile to deliver the before/after PNGs together,
   with a short caption naming what changed and what to look at.

## Keep specs around

`scripts/screenshot/specs/` is a growing visual-regression library, not a scratch
directory. Don't delete a spec after using it — if a later change touches the same
flow, extend its capture steps instead of writing a near-duplicate file.
