import * as React from "react";
import { it } from "vitest";
import userEvent from "@testing-library/user-event";
import {
  createTestRepo,
  findSidebarBranchElement,
  gitCommitRepoFile,
  openRepo,
} from "../../../test/utils";
import { render, screen } from "../../../test/test-utils";
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
    name: "workspace-file-picker-01-cmd-p-results",
    expectations: [
      "A Jump to File modal is open over the workspace view with placeholder 'Search files...'.",
      "The results list shows src/components/Button.tsx rather than an empty state.",
      "Keyboard hints for navigate, open, and close appear in the modal footer.",
    ],
  });
}, 60000);
