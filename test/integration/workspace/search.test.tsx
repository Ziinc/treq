import * as React from "react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createTestRepo,
  findSidebarBranchElement,
  openRepo,
  resolveWorkspacePath,
  writeWorkspaceFile,
} from "../../utils";
import {
  type Workspace,
  createWorkspace,
  getWorkspaces,
} from "../../../src/lib/api";
import { render, screen, waitFor } from "../../test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import userEvent from "@testing-library/user-event";

async function setupWorkspaceWithChange(branchName: string): Promise<{
  repoPath: string;
  workspace: Workspace;
}> {
  const { repoPath } = createTestRepo(false);
  openRepo(repoPath);

  const workspaceId = await createWorkspace(repoPath, branchName);
  const workspace = (await getWorkspaces(repoPath)).find(
    (w) => w.id === workspaceId
  );
  if (!workspace) throw new Error(`Workspace not found for id ${workspaceId}`);

  writeWorkspaceFile(
    resolveWorkspacePath(repoPath, workspace.workspace_path),
    "search-test.txt",
    "hello world line one\nhello world line two\nsome other content\n"
  );

  return { repoPath, workspace };
}

describe("ShowWorkspace - Search integration", () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
  });

  it("opens search overlay with Ctrl+F and shows matches", async () => {
    const branchName = "feat/search-test";
    await setupWorkspaceWithChange(branchName);

    render(<Dashboard />);
    await user.click(await findSidebarBranchElement(branchName));

    const reviewTab = await screen.findByRole("tab", { name: /^Review/ });
    await user.click(reviewTab);
    await screen.findByRole("tab", { name: /^Review/, selected: true });

    await waitFor(() =>
      expect(screen.getAllByText("search-test.txt").length).toBeGreaterThan(0)
    );

    await user.keyboard("{Control>}f{/Control}");

    const searchInput = await screen.findByPlaceholderText("Find");
    expect(searchInput).toBeInTheDocument();

    await user.type(searchInput, "hello");

    await waitFor(
      () => {
        expect(screen.queryByText(/of \d+/)).toBeTruthy();
      },
      { timeout: 3000 }
    );
  });

  it("closes search overlay with Escape", async () => {
    const branchName = "feat/search-close-test";
    await setupWorkspaceWithChange(branchName);

    render(<Dashboard />);
    await user.click(await findSidebarBranchElement(branchName));

    const reviewTab = await screen.findByRole("tab", { name: /^Review/ });
    await user.click(reviewTab);
    await screen.findByRole("tab", { name: /^Review/, selected: true });

    await waitFor(() =>
      expect(screen.getAllByText("search-test.txt").length).toBeGreaterThan(0)
    );

    await user.keyboard("{Control>}f{/Control}");
    const searchInput = await screen.findByPlaceholderText("Find");
    expect(searchInput).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByPlaceholderText("Find")).toBeNull();
    });
  });
});
