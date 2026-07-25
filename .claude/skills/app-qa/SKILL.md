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
  that reminder as the trigger to run this skill, not just a suggestion. Also use when
  a pull request is being opened for work that generated screenshots in this session,
  to pick which ones belong in the PR body and how to attach them.
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

This extends to *setup*, not just the behavior under test: if the scenario's
narrative includes "the user creates a workspace" (or renames one, deletes one,
etc.) as a step, create it by clicking through the real dialog (the "Stack" button
on the home repo header, or "Stack" on an existing workspace's header to create a
stacked child) rather than calling `createWorkspace()` from `src/lib/api` directly.
The API helper is still fine for *incidental background state* a spec needs but
isn't itself testing (e.g. two throwaway workspaces just so a branch-switcher
dropdown has something to list). `scripts/screenshot/specs/commits-tab-after-push.spec.tsx`
is the worked example: it drives the whole "Stack" dialog (open it, type a branch
name, submit) with `userEvent`, not the API helper, because workspace creation is
part of the scenario being verified.

## How the harness works

1. `createTestRepo()` (from `test/utils`, backed by the `treq-napi` addon) creates a
   real jj repository on disk, exactly like an integration test.
2. `render(<Dashboard/>)` (from `test/test-utils`) mounts the real React tree in
   jsdom, with Tauri's `invoke` replaced by real Rust dispatch
   (`test/setup.screenshot.ts`) — no mocked backend, no mocked ShowWorkspace,
   FileBrowser, ChangesDiffViewer, etc.
3. `captureDocument(document, { name, expectations })` (`scripts/screenshot/capture.ts`)
   serializes the live DOM, inlines the app's real compiled Tailwind CSS
   (`scripts/screenshot/build-css.mjs` output), and hands the resulting static HTML to
   headless Chromium (`playwright-core`, pinned to the pre-installed browser) purely
   to rasterize it into a PNG. jsdom itself never paints a pixel — Chromium is only
   there for the pixels. It also writes `<name>.json` next to the PNG recording the
   `expectations` you passed (see step 4 below).

`test/setup.screenshot.ts` is a near-duplicate of `test/setup.integration.ts` with one
difference: `test/integration/**` fails a run the moment any still-un-migrated `jj_*`
command is invoked (an ongoing tracker for code that should call `core::*` instead).
The screenshot harness exists to show current real behavior, debt included, so it
only logs which `jj_*` commands fired instead of failing the spec. If driving a real
flow hits a command the NAPI bridge has stubbed out as `not_implemented` (see the
bucket of commands in `crates/treq-napi/src/dispatch.rs` marked "Direct jj::*
commands"), that's a genuine gap in the test bridge, not a reason to fall back to an
API-helper workaround — implement the missing dispatch case for real (it's almost
always a thin call into an existing `treq_lib::jj::*` or `core::*` function; see the
`set_workspace_target_branch`, `jj_git_fetch_background`, and `jj_check_branch_exists`
cases in `dispatch.rs` for the pattern). That's a test-bridge-only change
(`crates/treq-napi/`), not a production Rust change — treat touching production
command code as a separate, bigger decision and check with the user first.

## Steps

1. **Identify the behavior to verify.** From the user's ask, or from the changed
   file(s) named in the hook's `additionalContext`, work out which user-facing flow
   changed. Search `test/integration/**` and `test/*.test.tsx` for a scenario that
   already sets up the right repo/workspace state (`createTestRepo`, `commitRepoFile`,
   etc.) and reuse that setup instead of inventing your own — it's already proven to
   work against the real backend. Remember the rule above: if workspace creation is
   part of the scenario, drive it through the real UI, not `createWorkspace()`.

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
     // ... real repo setup via test/utils + src/lib/api; drive workspace
     // creation/deletion/etc. through the real UI if it's part of the scenario ...

     const user = userEvent.setup();
     render(<Dashboard />);

     // Real DOM assertions -- these prove the state is correct BEFORE capturing.
     // Separate from `expectations` below, which are about the picture, not the DOM.
     await screen.findByTestId("show-workspace-header");
     await captureDocument(document, {
       name: "<slug>-01-before",
       expectations: [
         "Plain-English claim about what this screenshot should show visually.",
         "A second claim, if there's more than one thing worth checking in the image.",
       ],
     });

     // Drive the flow -- ONLY user.* calls, never fireEvent.
     await user.click(await screen.findByRole("button", { name: "..." }));
     await screen.findByText("..."); // wait for the resulting DOM change
     await captureDocument(document, {
       name: "<slug>-02-after",
       expectations: ["What changed, stated as a visual claim about the after image."],
     });
   }, 60000);
   ```

   `scripts/screenshot/specs/workspace-branch-switch.spec.tsx` is a worked example of
   the userEvent + multi-step-capture shape. `commits-tab-after-push.spec.tsx` is the
   worked example of driving workspace creation through the real "Stack" dialog. Copy
   whichever shape fits.

   Give every capture a numbered, descriptive `name` — that string becomes the PNG
   (and manifest JSON) filename, so name it as `<slug>-<NN>-<what-it-shows>`.

3. **`expectations` are for the picture, not the DOM.** `captureDocument` requires a
   non-empty `expectations: string[]` — plain-English claims about what a viewer
   should be able to confirm by *looking at the screenshot* (colors, layout, which
   button is visible, what a toast says, whether a list has the right items). These
   are not code assertions and `captureDocument` does not execute them; they're
   written to `<name>.json` next to the PNG specifically so that step 4 has a
   concrete, per-screenshot checklist instead of "eyeball it and hope you notice
   something wrong." Keep the real `screen.findBy*`/`expect` calls in the spec body
   too (still required, still what proves the DOM reached that state) — the two are
   complementary, not a replacement for each other.

4. **Run it.**
   - First run in a session, or after touching `src-tauri` / `crates/treq-napi`, or
     adding new Tailwind classes: `npm run screenshot` (rebuilds the NAPI addon,
     recompiles CSS, runs every spec — slow but complete).
   - Fast iteration on one spec once the addon/CSS are already built:
     `npx vitest run --config vitest.screenshot.config.ts scripts/screenshot/specs/<slug>.spec.tsx`
   - If only Tailwind classes changed (no Rust change): `npm run screenshot:css` first,
     then the targeted vitest run above.

5. **Verify each screenshot against its expectations before saying the task is done.**
   For every capture: read `scripts/screenshot/.generated/<name>.json` for its
   expectations list, then read `scripts/screenshot/.generated/<name>.png` (multimodal
   Read) and go through the list confirming or refuting each one against what the
   image actually shows. A spec whose `expect`/`findBy*` calls all passed can still
   render a visibly broken layout, a missing state, or wrong copy — that's a real bug
   to fix, not a false alarm, and the expectations checklist is what catches it
   instead of a cursory glance.

6. **Show the result.** Use SendUserFile to deliver the before/after PNGs together,
   with a short caption naming what changed and what to look at, and call out any
   expectation that didn't hold.

7. **If a pull request is created for this work, attach the screenshots to it.** See
   the next section — this is part of the task, not an optional extra.

## Attaching screenshots to a pull request

If this session generated new screenshots *and* a pull request is opened for the same
work (whether you open it or the user asks for one), the PR body must carry those
screenshots. Applies both when the PR is created after the QA run and when QA happens
on a branch that already has a PR — in the latter case, update the existing body.

### Which screenshots go in

Only PNGs that are **new or changed in this agent session**. The
`scripts/screenshot/specs/` library accumulates captures from earlier work; a spec run
that reproduces an unchanged image from a previous session is not part of this PR's
story and stays out. If a run regenerated an existing capture and the image genuinely
changed because of this session's change, that counts as new.

From that set, include only the frames that show the **specific fix or feature** the PR
is about — the sequence that ends on the desired end result, with the fix visible in and
proven by the spec that produced them. Concretely:

- **Exclude setup screenshots.** Captures of preconditions — the repo just opened, an
  empty workspace list, a dialog mid-scaffold before the relevant interaction, a fixture
  being built up — are there so the spec can reach the interesting state. They are not
  evidence of anything and do not belong in the PR.
- **Exclude non-relevant screenshots.** A spec that captures six frames while only two
  of them show the changed behavior contributes two frames to the PR. Unrelated panels,
  incidental flows, and captures from other specs that happened to re-run in the same
  `npm run screenshot` invocation stay out.
- **Keep a "before" only when it earns its place.** A before/after pair belongs in the
  PR when the before frame is what makes the fix legible (it shows the bug, or the old
  layout being replaced). A before frame that is merely the starting state is a setup
  screenshot — drop it.
- **One screenshot per aspect.** If the feature has multiple distinct aspects — several
  states, several surfaces it appears on, several inputs that behave differently — each
  gets its own screenshot. Don't collapse a multi-part feature into a single frame, and
  don't pad a single-aspect fix into a gallery.
- **Never attach a screenshot whose expectations failed** in step 5 (unless the failure
  itself is the thing being reported). Fix it and re-capture first.

### Order and presentation

Put them in the PR body in the sequence a user walks the flow, ending on the desired end
result. Each screenshot gets a short heading saying what it shows and, where it isn't
obvious, one line on what to look at. Name the PR's copies `NN-<what-it-shows>.png` so
the ordering is readable in the diff.

### Mechanism

GitHub's API has no attachment upload, so the images ride along in the branch:

1. `scripts/screenshot/.generated/` is gitignored. Copy the curated PNGs (renamed as
   above) into `scripts/screenshot/qa/<pr-slug>/`, which is committed.
2. Commit them with the change and push to the designated branch.
3. Reference them in the PR body with raw URLs pinned to the pushed commit SHA:
   `![alt](https://raw.githubusercontent.com/<owner>/<repo>/<sha>/scripts/screenshot/qa/<pr-slug>/01-....png)`
   — a SHA-pinned URL keeps rendering after later pushes and after merge.
4. If the PR already exists, update its body (`update_pull_request`) rather than
   posting the screenshots as a follow-up comment.

Copy only the curated set into `qa/` — the point of the curation rules above is that
this directory stays small, so leave everything else in `.generated/`.

If the session produced no new screenshots, add no screenshot section at all; an empty
or placeholder gallery is worse than none.

## Keep specs around

`scripts/screenshot/specs/` is a growing visual-regression library, not a scratch
directory. Don't delete a spec after using it — if a later change touches the same
flow, extend its capture steps instead of writing a near-duplicate file.
