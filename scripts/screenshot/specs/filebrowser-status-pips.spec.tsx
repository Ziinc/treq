/**
 * Captures the Code tab's (workspace Overview) top-level file list
 * highlighting jj file status via core::ls_workspace /
 * core::files::annotate_entry_statuses: a red pip for an unresolved
 * conflict, a blue pip for a file changed by an already-committed
 * (not-yet-rebased) ancestor commit, a yellow pip for an uncommitted
 * working-copy change, and untouched files collapsed behind a toggle. File
 * names themselves stay unstyled — only the pip carries the status color.
 */

import * as React from "react";
import { expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import {
  commitWorkspaceFile,
  createTestRepo,
  findSidebarBranchElement,
  openRepo,
  resolveWorkspacePath,
  writeWorkspaceFile,
} from "../../../test/utils";
import { render, screen, waitFor } from "../../../test/test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import {
  checkAndRebaseWorkspaces,
  createCommit,
  createWorkspace,
  ensureWorkspaceIndexed,
  getWorkspaces,
} from "../../../src/lib/api";
import { captureDocument } from "../capture";

it("captures conflict/committed/working-copy status pips in the Code tab file list", async () => {
  const branchName = "feat/file-status-pips";
  const { repoPath, defaultBranch } = createTestRepo(false);
  openRepo(repoPath);

  const workspaceId = await createWorkspace(repoPath, branchName);
  const workspace = (await getWorkspaces(repoPath)).find(
    (candidate) => candidate.id === workspaceId,
  );
  if (!workspace) throw new Error(`Workspace not found for id ${workspaceId}`);
  const workspacePath = resolveWorkspacePath(
    repoPath,
    workspace.workspace_path,
  );

  // Conflict (red): diverge README.md between the workspace and main, then
  // rebase the workspace onto main so the two edits collide.
  writeWorkspaceFile(workspacePath, "README.md", "workspace side\n");
  await createCommit(repoPath, workspaceId, "workspace conflicting change");
  writeWorkspaceFile(repoPath, "README.md", "main side\n");
  await createCommit(repoPath, null, "main conflicting change");
  await checkAndRebaseWorkspaces(repoPath, workspaceId, defaultBranch, true);

  // Committed (blue): a real commit in the workspace, not yet rebased onto
  // the target branch.
  await commitWorkspaceFile(
    repoPath,
    { id: workspace.id, path: workspace.workspace_path },
    "committed.txt",
    "committed content\n",
    "add committed file",
  );

  // Working copy (yellow): an uncommitted edit sitting in @.
  writeWorkspaceFile(workspacePath, "dirty.txt", "uncommitted\n");

  await ensureWorkspaceIndexed(repoPath, workspaceId, workspacePath);

  const user = userEvent.setup();
  render(<Dashboard />);

  await screen.findByTestId(`workspace-conflict-indicator-${workspaceId}`);
  await user.click(await findSidebarBranchElement(branchName));
  await screen.findByTestId("show-workspace-header");

  await screen.findByRole("button", { name: /committed\.txt/ });
  await screen.findByRole("button", { name: /dirty\.txt/ });
  await screen.findByRole("button", { name: /README\.md/ });

  await waitFor(() => {
    const readmeRow = screen.getByRole("button", { name: /README\.md/ });
    expect(readmeRow.querySelector(".bg-red-500")).toBeTruthy();

    const committedRow = screen.getByRole("button", {
      name: /committed\.txt/,
    });
    expect(committedRow.querySelector(".bg-blue-500")).toBeTruthy();

    const dirtyRow = screen.getByRole("button", { name: /dirty\.txt/ });
    expect(dirtyRow.querySelector(".bg-yellow-500")).toBeTruthy();
  });

  await captureDocument(document, {
    name: "filebrowser-status-pips-01-tree",
    expectations: [
      "README.md's row shows a red pip (its file name stays default-colored, not red), signalling an unresolved conflict.",
      "committed.txt's row shows a blue pip, signalling a change already committed but not yet rebased onto the target branch.",
      "dirty.txt's row shows a yellow pip, signalling an uncommitted working-copy change.",
    ],
  });

  // Untouched files (e.g. the repo's other starting files) should be
  // collapsed behind a toggle instead of cluttering the list.
  const toggle = await screen.findByTestId("toggle-untouched-files");
  await captureDocument(document, {
    name: "filebrowser-status-pips-02-collapsed-toggle",
    expectations: [
      'A "Show N unchanged files" toggle button is visible below the highlighted files.',
      "Only README.md, committed.txt, and dirty.txt are listed above the toggle — no other, untouched files are shown.",
    ],
  });

  await user.click(toggle);
  await screen.findByTestId("toggle-untouched-files");
  await waitFor(() => {
    expect(screen.getByTestId("toggle-untouched-files")).toHaveTextContent(
      "Hide unchanged files",
    );
  });
  await captureDocument(document, {
    name: "filebrowser-status-pips-03-expanded",
    expectations: [
      "Clicking the toggle revealed additional, untouched files in dimmed/grey text with no pip.",
      'The toggle button now reads "Hide unchanged files".',
    ],
  });
}, 90000);
