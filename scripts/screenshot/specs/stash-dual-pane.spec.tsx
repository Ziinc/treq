import * as React from "react";
import { expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import {
  createTestRepo,
  findSidebarBranchElement,
  openRepo,
  resolveWorkspacePath,
  writeWorkspaceFile,
} from "../../../test/utils";
import { createWorkspace, getWorkspaces } from "../../../src/lib/api";
import { render, screen, waitFor, within } from "../../../test/test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import { captureDocument } from "../capture";

it("captures stash-all from Changes and the dual-pane stash modal", async () => {
  const branchName = "feat/stash-demo";
  const { repoPath } = createTestRepo(false);
  openRepo(repoPath);

  const workspaceId = await createWorkspace(repoPath, branchName);
  const workspace = (await getWorkspaces(repoPath)).find(
    (w) => w.id === workspaceId,
  );
  if (!workspace) throw new Error(`Workspace not found for id ${workspaceId}`);

  writeWorkspaceFile(
    resolveWorkspacePath(repoPath, workspace.workspace_path),
    "stash-demo.txt",
    "stashed line one\nstashed line two\n",
  );

  const user = userEvent.setup();
  render(<Dashboard />);

  await user.click(await findSidebarBranchElement(branchName));
  const reviewTab = await screen.findByRole("tab", { name: /^Review/ });
  await user.click(reviewTab);
  await screen.findByRole("tab", { name: /^Review/, selected: true });

  await waitFor(() =>
    expect(screen.getAllByText("stash-demo.txt").length).toBeGreaterThan(0),
  );

  await captureDocument(document, {
    name: "stash-01-changes-before",
    expectations: [
      'The Changes section lists "stash-demo.txt" with a stash (archive) button available next to discard.',
      "No stash modal is open.",
    ],
  });

  const stashButton = await screen.findByTestId("stash-all-changes");
  await user.click(stashButton);

  await waitFor(() =>
    expect(screen.queryByText("stash-demo.txt")).not.toBeInTheDocument(),
  );

  await captureDocument(document, {
    name: "stash-02-after-stash-clean",
    expectations: [
      "After stashing, stash-demo.txt is gone from the Changes list (working copy cleaned).",
      "A success toast about stashed changes may be visible.",
    ],
  });

  // Open stash browser via command palette
  await user.keyboard("{Meta>}k{/Meta}");
  const cmdk = await screen.findByTestId("modal");
  const input = within(cmdk).getByPlaceholderText(/type a command/i);
  await user.type(input, "stash");
  await user.click(
    await within(cmdk).findByText("View Stashed Changes"),
  );

  const stashModal = await screen.findByTestId("stash-modal");
  const list = await within(stashModal).findByTestId("stash-list");
  expect(within(list).getByText(branchName)).toBeTruthy();
  await within(stashModal).findByTestId("stash-diff-pane");

  await captureDocument(document, {
    name: "stash-03-dual-pane-modal",
    expectations: [
      "A dual-pane 'Stashed Changes' dialog is open with a left list of stash entries and a right diff pane.",
      "The left list shows the workspace branch, a short commit hash, +/− LOC, and file count; the right pane shows the isolated stash-demo.txt diff.",
    ],
  });

  await user.click(await within(stashModal).findByTestId("stash-more-menu"));
  await screen.findByTestId("stash-copy-patch");
  await screen.findByTestId("stash-apply-submenu");
  await screen.findByTestId("stash-delete");

  await captureDocument(document, {
    name: "stash-04-more-menu",
    expectations: [
      "The stash more-menu dropdown is open showing Apply to workspace, Copy as git patch, and Delete stash.",
    ],
  });
}, 90000);
