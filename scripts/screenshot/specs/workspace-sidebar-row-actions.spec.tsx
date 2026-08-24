import { it } from "vitest";
import {
  createTestRepo,
  findSidebarBranchElement,
  openRepo,
  resolveWorkspacePath,
  writeWorkspaceFile,
} from "../../../test/utils";
import { render, screen, within } from "../../../test/test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import {
  checkAndRebaseWorkspaces,
  createCommit,
  createWorkspace,
  ensureWorkspaceIndexed,
  getWorkspaces,
} from "../../../src/lib/api";
import { captureDocument } from "../capture";

// Verifies the VS Code-style conditional row layout: hidden actions reserve
// no space by default (only the branch icon, name, and conflict marker show),
// and hovering/focusing the row swaps the conflict marker out for the action
// buttons in normal flex flow.
it("captures default and hovered states for plain and conflicted workspace rows", async () => {
  const { repoPath, defaultBranch } = createTestRepo(false);
  openRepo(repoPath);

  // Incidental background state: a plain, non-conflicted sibling workspace
  // so both row variants are visible in the sidebar at once.
  await createWorkspace(repoPath, "feat/plain-row");

  // The conflicted row is the real scenario under test: drive treq's own
  // auto-rebase onto a diverged default branch so the conflict indicator
  // comes from real jj conflict state, not a stubbed flag.
  const workspaceId = await createWorkspace(repoPath, "feat/conflicted-row");
  const workspace = (await getWorkspaces(repoPath)).find(
    (w) => w.id === workspaceId,
  );
  if (!workspace) throw new Error("Workspace not found");
  const workspacePath = resolveWorkspacePath(
    repoPath,
    workspace.workspace_path,
  );

  writeWorkspaceFile(workspacePath, "README.md", "workspace side\n");
  await createCommit(repoPath, workspaceId, "workspace conflicting change");

  writeWorkspaceFile(repoPath, "README.md", "main side\n");
  await createCommit(repoPath, null, "main conflicting change");

  await checkAndRebaseWorkspaces(repoPath, workspaceId, defaultBranch, true);
  await ensureWorkspaceIndexed(repoPath, workspaceId, workspacePath);

  render(<Dashboard />);
  await screen.findByTestId(`workspace-conflict-indicator-${workspaceId}`);

  await captureDocument(document, {
    name: "workspace-sidebar-row-actions-01-default",
    expectations: [
      "The feat/plain-row sidebar row shows only the branch icon and branch name, with no visible action buttons and no extra empty space reserved on its right edge.",
      "The feat/conflicted-row sidebar row shows a red conflict-triangle icon flush against the right edge of the row, with no action buttons visible.",
    ],
  });

  // The action buttons are shown purely via CSS `group-hover`/`group-focus-within`,
  // with no JS-driven visibility toggle, so the DOM already contains them
  // regardless of jsdom's hover state -- confirm they're present, then let
  // Playwright's real `hoverSelector` drive the CSS-visible state for the
  // screenshot instead of jsdom `userEvent.hover` (whose Radix tooltip side
  // effects don't reset cleanly between successive captures in one document).
  const plainRow = (await findSidebarBranchElement("feat/plain-row")).closest(
    "div",
  ) as HTMLElement;
  await within(plainRow).findByRole("button", { name: "Start agent" });
  await screen.findByTestId(`workspace-conflict-indicator-${workspaceId}`);

  await captureDocument(document, {
    name: "workspace-sidebar-row-actions-02-hover-plain",
    hoverSelector: '[data-testid="workspace-sidebar-item-feat/plain-row"]',
    expectations: [
      "The feat/plain-row sidebar row is hovered and now shows three small action icon buttons (agent, shell, stack) at its right edge in place of empty space.",
      "The branch name text is still fully legible and is not overlapped by the action buttons.",
    ],
  });

  const conflictedRow = (
    await findSidebarBranchElement("feat/conflicted-row")
  ).closest("div") as HTMLElement;
  await within(conflictedRow).findByRole("button", { name: "Start agent" });
  await screen.findByTestId(`workspace-conflict-indicator-${workspaceId}`);

  await captureDocument(document, {
    name: "workspace-sidebar-row-actions-03-hover-conflicted",
    hoverSelector: '[data-testid="workspace-sidebar-item-feat/conflicted-row"]',
    expectations: [
      "The feat/conflicted-row sidebar row is hovered and shows the three action icon buttons at its right edge.",
      "The red conflict-triangle icon that was visible on this row before hovering is no longer shown.",
    ],
  });
}, 60000);
