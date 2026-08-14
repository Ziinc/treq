import * as React from "react";
import { expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { createTestRepo, openRepo } from "../../../test/utils";
import { render, screen, within } from "../../../test/test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import { createWorkspace } from "../../../src/lib/api";
import { captureDocument } from "../capture";

it("captures home repo sidebar agent/shell/stack buttons", async () => {
  const { repoPath } = createTestRepo(false);
  openRepo(repoPath);

  await createWorkspace(repoPath, "feat/sibling");

  const user = userEvent.setup();
  render(<Dashboard />);

  const homeRepoElement = await screen.findByTestId("home-repo-row");
  await screen.findByText("feat/sibling");

  // Select home so the action buttons are fully opaque (same as workspace rows).
  await user.click(homeRepoElement);
  expect(homeRepoElement).toHaveClass("bg-primary/20");
  expect(
    within(homeRepoElement).getByRole("button", { name: "Start agent" }),
  ).toBeTruthy();
  expect(
    within(homeRepoElement).getByRole("button", { name: "Open shell" }),
  ).toBeTruthy();
  expect(
    within(homeRepoElement).getByRole("button", {
      name: "Stack a workspace",
    }),
  ).toBeTruthy();

  await captureDocument(document, {
    name: "home-repo-sidebar-actions-01-selected",
    expectations: [
      "The top sidebar home-repo row is highlighted and shows three small icon buttons on the right (bot/agent, terminal/shell, layers/stack).",
      "A workspace named feat/sibling appears under the Workspaces heading below the home row.",
      "The home row still shows the home icon and the default branch name on the left.",
    ],
  });

  await user.click(
    within(homeRepoElement).getByRole("button", {
      name: "Stack a workspace",
    }),
  );
  expect(await screen.findByText("Stack a new Workspace")).toBeVisible();
  expect(
    screen.getByText(
      "Create a new workspace from the current branch. Optionally move file changes.",
    ),
  ).toBeVisible();

  await captureDocument(document, {
    name: "home-repo-sidebar-actions-02-stack-dialog",
    expectations: [
      "A modal titled 'Stack a new Workspace' is open over the dashboard.",
      "The dialog description says it creates a workspace from the current branch.",
    ],
  });
}, 60000);
