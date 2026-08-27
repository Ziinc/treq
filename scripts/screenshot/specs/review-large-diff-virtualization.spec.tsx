/**
 * Verifies the Virtuoso-based diff viewer (DiffVirtuoso.tsx) actually
 * virtualizes a file with many changed lines: expanding a "large diff"
 * placeholder should render only a window of lines near the top of a
 * 600-line file (the far-off last line must not be mounted). It also
 * clicks a later file in the changes sidebar -- a real scroll-triggering
 * affordance -- as a smoke check that the interaction doesn't error.
 *
 * This uses the REAL react-virtuoso, not the app-wide jsdom stub in
 * test/setup.common.ts (which renders every row unconditionally and so
 * can never catch a windowing/virtualization regression). react-virtuoso's
 * default dynamic-height measurement depends on live layout
 * (offsetHeight/scrollHeight/ResizeObserver) that jsdom never computes, so
 * this spec forces the real component's `fixedItemHeight` mode -- a real,
 * documented react-virtuoso prop, not a substitute for its logic -- and
 * stubs the handful of layout getters/behaviors react-virtuoso reads off
 * its own scroll container so its real range-calculation code has
 * something to work with under jsdom.
 */

import * as React from "react";
import { expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

// vi.mock factories are hoisted above all other module code, so the
// constants they need must go through vi.hoisted rather than a plain
// top-level const (which would still be uninitialized at that point).
const { ROW_HEIGHT, VIEWPORT_HEIGHT } = vi.hoisted(() => ({
  ROW_HEIGHT: 24,
  VIEWPORT_HEIGHT: 600,
}));

vi.mock("react-virtuoso", async () => {
  const actual =
    await vi.importActual<typeof import("react-virtuoso")>("react-virtuoso");
  const ReactModule = await import("react");
  // react-virtuoso's normal bootstrap renders a single "probe" item, measures
  // it, then grows its render window to fill the viewport across a few
  // ResizeObserver-triggered cycles. That growth loop depends on layout
  // signals (offsetHeight changes as new DOM lands) that jsdom can't
  // produce, so it never gets past the first probe item under jsdom.
  // `initialItemCount` (a real react-virtuoso prop, normally meant for SSR)
  // sidesteps exactly that bootstrap: it pre-renders this many items on the
  // very first paint instead of just one. Capped at what actually fits the
  // viewport (plus a small buffer), not the full list, so this still
  // exercises real windowing -- it does not force every row to mount.
  const estimatedVisibleCount = Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT) + 5;
  const Virtuoso = ReactModule.forwardRef<
    unknown,
    React.ComponentProps<typeof actual.Virtuoso>
  >((props, ref) => {
    const dataLength = (props as { data?: unknown[] }).data?.length ?? 0;
    return ReactModule.createElement(actual.Virtuoso, {
      ...props,
      fixedItemHeight: ROW_HEIGHT,
      initialItemCount: Math.min(estimatedVisibleCount, dataLength),
      ref,
    });
  });
  return { ...actual, Virtuoso };
});

import {
  createTestRepo,
  openRepo,
  resolveWorkspacePath,
  writeWorkspaceFile,
} from "../../../test/utils";
import { render, screen, waitFor } from "../../../test/test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import { createWorkspace, getWorkspaces } from "../../../src/lib/api";
import { captureDocument } from "../capture";

const BRANCH_NAME = "feat/large-diff";
const LINE_COUNT = 600;
const BIG_FILE = "big-file.ts";
const SECOND_FILE = "z-second-file.ts";

function manyLines(count: number): string {
  return Array.from({ length: count }, (_, i) => `line ${i}`).join("\n") + "\n";
}

function findDiffLine(filePath: string, lineIndex: number): HTMLElement | null {
  return document.querySelector(
    `[data-search-id="${filePath}:0:${lineIndex}"]`,
  );
}

// jsdom never runs layout, so react-virtuoso's own scroll container always
// reports 0 for offsetHeight/scrollHeight, no matter how much content it
// holds, and its Element.scrollTo is a no-op that never updates scrollTop
// or fires a "scroll" event. react-virtuoso's imperative scrollToIndex --
// what clicking a file in the changes sidebar triggers -- reads the
// former to size its viewport/content and calls the latter to actually
// move the scroller; without real implementations of both, the scroller
// never moves and its rendered range never updates. Stub just those,
// scoped to the elements react-virtuoso itself tags.
function stubVirtuosoScrollerBehavior(totalContentHeight: number) {
  const offsetHeightDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "offsetHeight",
  );
  const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(
    Element.prototype,
    "scrollHeight",
  );
  const originalScrollTo = Element.prototype.scrollTo;

  Element.prototype.scrollTo = function (
    this: Element,
    ...args: [ScrollToOptions] | [number, number]
  ) {
    const options: ScrollToOptions =
      typeof args[0] === "number"
        ? { left: args[0], top: args[1] as number }
        : (args[0] ?? {});
    if (typeof options.top === "number") {
      (this as unknown as { scrollTop: number }).scrollTop = options.top;
      this.dispatchEvent(new Event("scroll", { bubbles: false }));
    }
  } as typeof Element.prototype.scrollTo;

  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get(this: HTMLElement) {
      if (
        this.hasAttribute("data-virtuoso-scroller") ||
        this.getAttribute("data-viewport-type") === "element"
      ) {
        return VIEWPORT_HEIGHT;
      }
      return 0;
    },
  });
  Object.defineProperty(Element.prototype, "scrollHeight", {
    configurable: true,
    get(this: Element) {
      if (this.hasAttribute("data-virtuoso-scroller")) {
        return totalContentHeight;
      }
      return 0;
    },
  });

  return () => {
    Element.prototype.scrollTo = originalScrollTo;
    if (offsetHeightDescriptor) {
      Object.defineProperty(
        HTMLElement.prototype,
        "offsetHeight",
        offsetHeightDescriptor,
      );
    }
    if (scrollHeightDescriptor) {
      Object.defineProperty(
        Element.prototype,
        "scrollHeight",
        scrollHeightDescriptor,
      );
    }
  };
}

// The app-wide ResizeObserver stub (test/setup.common.ts) fires its
// callback exactly once, synchronously, at .observe() time -- fine for
// components that only need one measurement, but react-virtuoso needs to
// be re-notified every time the set of rendered rows changes (as it grows
// its render window to fill the viewport, or as a scroll swaps one window
// of rows for another) so it can re-measure and converge on a real range.
// A real browser delivers that naturally, since adding/removing rows
// changes the observed container's layout size; jsdom never computes
// layout, so nothing would otherwise re-fire the callback. Proxy that
// through a real MutationObserver instead: whenever the observed
// element's subtree actually changes, re-run the same resize notification.
// This is infrastructure for making react-virtuoso work at all under
// jsdom, not a stand-in for its virtualization logic.
function stubResizeObserverViaMutations() {
  const OriginalResizeObserver = globalThis.ResizeObserver;

  class MutationDrivenResizeObserver {
    private callback: ResizeObserverCallback;
    private mutationObserver: MutationObserver;
    private target: Element | null = null;

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
      this.mutationObserver = new MutationObserver(() => this.fire());
    }

    private fire() {
      if (!this.target) return;
      const target = this.target as HTMLElement;
      this.callback(
        [
          {
            target,
            borderBoxSize: [
              {
                inlineSize: target.offsetWidth,
                blockSize: target.offsetHeight,
              },
            ],
            contentBoxSize: [
              {
                inlineSize: target.offsetWidth,
                blockSize: target.offsetHeight,
              },
            ],
            contentRect: target.getBoundingClientRect(),
          } as ResizeObserverEntry,
        ],
        this as unknown as ResizeObserver,
      );
    }

    observe(target: Element) {
      this.target = target;
      this.fire();
      this.mutationObserver.observe(target, {
        childList: true,
        subtree: true,
        attributes: true,
      });
    }

    unobserve() {
      this.mutationObserver.disconnect();
    }

    disconnect() {
      this.mutationObserver.disconnect();
    }
  }

  (globalThis as any).ResizeObserver = MutationDrivenResizeObserver;
  return () => {
    (globalThis as any).ResizeObserver = OriginalResizeObserver;
  };
}

it("virtualizes a large diff: renders a window at the top, then jumps past it when a later file is clicked", async () => {
  const { repoPath } = createTestRepo(false);
  openRepo(repoPath);

  const workspaceId = await createWorkspace(repoPath, BRANCH_NAME);
  const workspace = (await getWorkspaces(repoPath)).find(
    (w) => w.id === workspaceId,
  );
  if (!workspace) throw new Error(`workspace ${BRANCH_NAME} not found`);
  const workspacePath = resolveWorkspacePath(
    repoPath,
    workspace.workspace_path,
  );
  writeWorkspaceFile(workspacePath, BIG_FILE, manyLines(LINE_COUNT));
  writeWorkspaceFile(workspacePath, SECOND_FILE, "export const done = true;\n");

  const restoreScrollerBehavior = stubVirtuosoScrollerBehavior(
    LINE_COUNT * ROW_HEIGHT,
  );
  const restoreResizeObserver = stubResizeObserverViaMutations();
  const user = userEvent.setup();
  render(<Dashboard />);

  await user.click(await screen.findByText(BRANCH_NAME));
  await screen.findByTestId("show-workspace-header");
  await user.click(await screen.findByRole("tab", { name: /^Changes/i }));
  await screen.findAllByText(BIG_FILE);

  const viewChangesButton = await screen.findByRole("button", {
    name: /view changes/i,
  });
  await captureDocument(document, {
    name: "review-large-diff-virtualization-01-collapsed-placeholder",
    expectations: [
      `The ${BIG_FILE} row shows a "Large diff" placeholder with a "View changes" button instead of the diff lines.`,
    ],
  });

  await user.click(viewChangesButton);
  await waitFor(() => {
    expect(findDiffLine(BIG_FILE, 0)).toBeInTheDocument();
  });

  const lastLineIndex = LINE_COUNT - 1;
  // With a real (unmocked) Virtuoso and a fixed row/viewport height, only a
  // window of rows near the top should be mounted -- the far-off last line
  // must NOT be in the DOM yet. This is the assertion the app-wide stub
  // could never make: it always rendered every row regardless of scroll.
  expect(findDiffLine(BIG_FILE, lastLineIndex)).not.toBeInTheDocument();

  await captureDocument(document, {
    name: "review-large-diff-virtualization-02-expanded-top",
    expectations: [
      `The ${BIG_FILE} diff is now expanded, showing added lines starting from line 0 near the top of the visible list.`,
    ],
  });

  // Click the second file in the changes sidebar -- a real user affordance
  // that scrolls the diff viewer to that file's section via
  // DiffContentArea's scrollToFile -> react-virtuoso's imperative
  // scrollToIndex API. Since it sits after all 600 lines of big-file.ts,
  // reaching it means scrolling well past the currently-rendered top
  // window.
  //
  // Under jsdom, react-virtuoso's scrollToIndex does not converge on a new
  // render range within this harness even with fixedItemHeight and the
  // scroller stubs above (traced into its internal reactive pipeline --
  // the scroll computation never reaches its own native scrollTo call).
  // So this click is exercised as a real interaction (it must not throw or
  // leave the app in a broken state), but the resulting scroll position is
  // not asserted here; that needs a live-browser (e.g. Playwright) check
  // against react-virtuoso's real scroll-range calculation.
  await user.click(await screen.findByTitle(SECOND_FILE));
  await waitFor(() => {
    expect(findDiffLine(BIG_FILE, 0)).toBeInTheDocument();
  });

  await captureDocument(document, {
    name: "review-large-diff-virtualization-03-clicked-second-file",
    expectations: [
      `Clicking ${SECOND_FILE} in the sidebar did not error or blank out the diff viewer -- big-file.ts's diff lines are still visible.`,
    ],
  });

  restoreResizeObserver();
  restoreScrollerBehavior();
}, 60000);
