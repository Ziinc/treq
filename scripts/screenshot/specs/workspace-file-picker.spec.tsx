import * as React from "react";
import { expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import {
  createTestRepo,
  findSidebarBranchElement,
  gitCommitRepoFile,
  openRepo,
} from "../../../test/utils";
import { render, screen, waitFor } from "../../../test/test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import { createWorkspace } from "../../../src/lib/api";
import { captureDocument } from "../capture";

const BRANCH_NAME = "feat/file-picker";

it("captures Cmd+P file search from a workspace without a prior file-browser index", async () => {
  const { repoPath } = createTestRepo(false);
  await gitCommitRepoFile(
    repoPath,
    "src/components/Button.tsx",
    "export const Button = () => {};",
    "add Button",
  );
  await gitCommitRepoFile(
    repoPath,
    "src/components/Modal.tsx",
    "export const Modal = () => {};",
    "add Modal",
  );
  await createWorkspace(repoPath, BRANCH_NAME);
  openRepo(repoPath);

  const user = userEvent.setup();
  render(<Dashboard />);

  await user.click(await findSidebarBranchElement(BRANCH_NAME));
  await screen.findByTestId("show-workspace-header");

  await user.keyboard("{Control>}p{/Control}");
  await screen.findByPlaceholderText("Search files...");
  await screen.findByText(/Button\.tsx/);

  await captureDocument(document, {
    name: "workspace-file-picker-01-cmd-p-browse",
    expectations: [
      "A Jump to File modal is open over the workspace view with placeholder 'Search files...'.",
      "The results list shows tracked files such as src/components/Button.tsx rather than an empty state.",
      "Keyboard hints for navigate, open, and close appear in the modal footer.",
    ],
  });

  const input = screen.getByPlaceholderText("Search files...");
  await user.clear(input);
  await user.type(input, "Button");
  await screen.findByText(/Button\.tsx/);
  await waitFor(() => {
    expect(screen.queryByText(/Modal\.tsx/)).not.toBeInTheDocument();
  });

  await captureDocument(document, {
    name: "workspace-file-picker-02-filtered-search",
    expectations: [
      "The search input contains the typed query 'Button'.",
      "Only src/components/Button.tsx appears in the filtered results list.",
      "Other files such as Modal.tsx are not shown in the results list.",
    ],
  });
}, 60000);
