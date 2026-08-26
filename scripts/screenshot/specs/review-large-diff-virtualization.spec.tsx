/**
 * Verifies the Virtuoso-based diff viewer (DiffVirtuoso.tsx) for a file with
 * many changed lines: expanding a "large diff" placeholder reveals its
 * lines, and scrolling the diff viewer down to the file's last line keeps
 * that line's content rendered rather than showing a blank row.
 *
 * Note: react-virtuoso itself is mocked in test/setup.common.ts to render
 * every item unconditionally (real windowed virtualization needs layout
 * measurements jsdom can't provide). So this spec drives a real scroll
 * gesture on the diff viewer's actual scroll container and proves line
 * content survives it, but it cannot catch a real windowing/virtualization
 * regression that only shows up against react-virtuoso's real scroll-range
 * calculation in a live browser.
 */

import * as React from "react";
import { expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
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

function manyLines(count: number): string {
  return Array.from({ length: count }, (_, i) => `line ${i}`).join("\n") + "\n";
}

function findDiffLine(filePath: string, lineIndex: number): HTMLElement | null {
  return document.querySelector(
    `[data-search-id="${filePath}:0:${lineIndex}"]`,
  );
}

it("captures a large diff rendering fully once expanded and while scrolled", async () => {
  const { repoPath } = createTestRepo(false);
  openRepo(repoPath);

  const workspaceId = await createWorkspace(repoPath, BRANCH_NAME);
  const workspace = (await getWorkspaces(repoPath)).find(
    (w) => w.id === workspaceId,
  );
  if (!workspace) throw new Error(`workspace ${BRANCH_NAME} not found`);
  writeWorkspaceFile(
    resolveWorkspacePath(repoPath, workspace.workspace_path),
    "big-file.ts",
    manyLines(LINE_COUNT),
  );

  const user = userEvent.setup();
  render(<Dashboard />);

  await user.click(await screen.findByText(BRANCH_NAME));
  await screen.findByTestId("show-workspace-header");
  await user.click(await screen.findByRole("tab", { name: /^Changes/i }));
  await screen.findAllByText("big-file.ts");

  const viewChangesButton = await screen.findByRole("button", {
    name: /view changes/i,
  });
  await captureDocument(document, {
    name: "review-large-diff-virtualization-01-collapsed-placeholder",
    expectations: [
      'The big-file.ts row shows a "Large diff" placeholder with a "View changes" button instead of the diff lines.',
    ],
  });

  await user.click(viewChangesButton);
  await waitFor(() => {
    expect(findDiffLine("big-file.ts", 0)).toBeInTheDocument();
  });

  await captureDocument(document, {
    name: "review-large-diff-virtualization-02-expanded-top",
    expectations: [
      "The big-file.ts diff is now expanded, showing added lines starting from line 0 near the top of the visible list.",
    ],
  });

  // The diff viewer's actual scroll container is the div rendered by
  // <Virtuoso> itself, tagged "diff-virtuoso" -- the element a real user's
  // mouse wheel/scrollbar drag would scroll -- not the "h-full px-4"
  // wrapper DiffContentArea renders around it.
  const scroller = await screen.findByTestId("diff-virtuoso");
  const lastLineIndex = LINE_COUNT - 1;

  scroller.scrollTop = 1_000_000;
  scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
  expect(scroller.scrollTop).toBeGreaterThan(0);

  await waitFor(() => {
    expect(findDiffLine("big-file.ts", lastLineIndex)).toBeInTheDocument();
  });

  await captureDocument(document, {
    name: "review-large-diff-virtualization-03-scrolled-to-bottom",
    expectations: [
      `After scrolling the diff viewer down to the bottom, real line content (including line ${lastLineIndex}) is visible -- not a blank/empty row.`,
    ],
  });

  expect(findDiffLine("big-file.ts", lastLineIndex)).toBeInTheDocument();
}, 60000);
