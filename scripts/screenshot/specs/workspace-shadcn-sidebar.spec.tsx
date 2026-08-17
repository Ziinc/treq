import * as React from "react";
import { expect, it } from "vitest";
import {
  createTestRepo,
  findSidebarBranchElement,
  openRepo,
} from "../../../test/utils";
import { render, screen, within } from "../../../test/test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import { createWorkspace } from "../../../src/lib/api";
import { captureDocument } from "../capture";

it("captures the workspace list in the shadcn sidebar shell", async () => {
  const { repoPath } = createTestRepo(false);
  openRepo(repoPath);
  await createWorkspace(repoPath, "feat/alpha");

  render(<Dashboard />);

  await findSidebarBranchElement("feat/alpha");
  const sidebar = document.querySelector(
    '[data-sidebar="sidebar"]',
  ) as HTMLElement;
  expect(sidebar).toBeTruthy();
  expect(sidebar.querySelector('[data-sidebar="header"]')).toBeTruthy();
  expect(sidebar.querySelector('[data-sidebar="content"]')).toBeTruthy();
  expect(sidebar.querySelector('[data-sidebar="footer"]')).toBeTruthy();
  expect(within(sidebar).getByText("Workspaces")).toBeTruthy();
  expect(await screen.findByTestId("home-repo-row")).toBeTruthy();

  await captureDocument(document, {
    name: "workspace-shadcn-sidebar-01-shell",
    expectations: [
      "The left column is a full-height sidebar with the repo search header at the top.",
      "Home, Github, and a Workspaces heading sit above feat/alpha.",
      "A Sessions footer is pinned at the bottom of the sidebar.",
    ],
  });
}, 60000);
