import { describe, it, expect, beforeEach } from "vitest";
import * as React from "react";
import userEvent from "@testing-library/user-event";
import { fireEvent, render, screen, waitFor } from "../../test-utils";
import {
  commitRepoFile,
  commitWorkspaceFile,
  createTestRepo,
  findSidebarBranchElement,
  openRepo,
} from "../../utils";
import * as api from "../../../src/lib/api";
import { Dashboard } from "../../../src/components/Dashboard";

type WorkspaceRef = { id: number; path: string };

async function createWorkspaceRef(
  repoPath: string,
  branchName: string
): Promise<WorkspaceRef> {
  await api.createWorkspace(repoPath, branchName);
  const workspace = (await api.getWorkspaces(repoPath)).find(
    (candidate) => candidate.branch_name === branchName
  );
  expect(workspace).toBeTruthy();
  return { id: workspace!.id, path: workspace!.workspace_path };
}

async function openWorkspaceCommitsTab(
  user: ReturnType<typeof userEvent.setup>,
  branchName: string
) {
  render(<Dashboard />);
  await user.click(await findSidebarBranchElement(branchName));
  await user.click(await screen.findByRole("tab", { name: "Commits" }));
}

describe("ShowWorkspace - Commits tab", () => {
  let repoPath: string;

  let testWorkspace: WorkspaceRef;
  beforeEach(async () => {
    ({ repoPath } = createTestRepo(false));
    openRepo(repoPath);
    for (let i = 0; i < 13; i++) {
      await commitRepoFile(
        repoPath,
        `target-pagination-${i}.txt`,
        `target pagination content ${i}`,
        `Target pagination commit ${i}`
      );
    }

    testWorkspace = await createWorkspaceRef(repoPath, "feat/commits-it");
    await commitWorkspaceFile(
      repoPath,
      testWorkspace,
      "README.md",
      "commits-tab-diff-line-one",
      "Commits diff one"
    );
    await commitWorkspaceFile(
      repoPath,
      testWorkspace,
      "commit-page.txt",
      "commits-tab-diff-line-two",
      "Commits diff two"
    );
  });

  it("renders commit contents, shows per-commit diff, and paginates with load more", async () => {
    const user = userEvent.setup();
    await openWorkspaceCommitsTab(user, "feat/commits-it");

    await screen.findByText("Commits diff two");
    expect((await screen.findAllByText("Today")).length).toBeGreaterThan(0);
    expect(
      screen.queryByText("Target pagination commit 0")
    ).not.toBeInTheDocument();
	const commit = await screen.findByText("Commits diff two")
    await user.click(commit);
    await screen.findByText("commit-page.txt")
    await screen.findByText("commits-tab-diff-line-two")

    expect(
      screen.queryByText("Target pagination commit 0")
    ).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("Rebasing...")).not.toBeInTheDocument();
    });
    const loadMoreButton = screen.getByRole("button", {
      name: "Load more commits",
    });
    await user.click(loadMoreButton);

    await screen.findByText("Target pagination commit 0");
  });
});
