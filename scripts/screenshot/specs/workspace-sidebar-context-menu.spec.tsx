import { it } from "vitest";
import userEvent from "@testing-library/user-event";
import { createTestRepo, findSidebarBranchElement, openRepo } from "../../../test/utils";
import { render, screen } from "../../../test/test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import { createWorkspace } from "../../../src/lib/api";
import { captureDocument } from "../capture";

// Verifies the sidebar workspace row's right-click context menu offers
// "Archive Workspace" (not "Delete Workspace") since deletion here only
// archives the workspace rather than destroying it outright.
it("captures the workspace row context menu showing Archive Workspace", async () => {
  const { repoPath } = createTestRepo(false);
  openRepo(repoPath);

  await createWorkspace(repoPath, "feat/context-menu-row");

  const user = userEvent.setup();
  render(<Dashboard />);

  const row = await findSidebarBranchElement("feat/context-menu-row");
  await user.pointer({ keys: "[MouseRight]", target: row });

  await screen.findByText("Archive Workspace");

  await captureDocument(document, {
    name: "workspace-sidebar-context-menu-01-open",
    expectations: [
      "A right-click context menu is open over the feat/context-menu-row sidebar item.",
      "The menu contains an item labeled 'Archive Workspace' with an archive-box icon, and no 'Delete Workspace' item is present.",
    ],
  });
}, 60000);
