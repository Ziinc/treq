import * as React from "react";
import * as api from "../../../src/lib/api";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  listCommits,
} from "../../../src/lib/api";
import { render, screen, waitFor } from "../../test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import userEvent from "@testing-library/user-event";

const REVIEW_FILE = "reviews-flow.txt";

async function setupWorkspaceWithChange(branchName: string): Promise<{
  repoPath: string;
  workspace: Workspace;
  fileName: string;
}> {
  const { repoPath } = createTestRepo(false);
  openRepo(repoPath);

  const workspaceId = await createWorkspace(repoPath, branchName);
  const workspace = (await getWorkspaces(repoPath)).find(
    (item) => item.id === workspaceId,
  );
  if (!workspace) {
    throw new Error(`Workspace not found for id ${workspaceId}`);
  }

  writeWorkspaceFile(
    resolveWorkspacePath(repoPath, workspace.workspace_path),
    REVIEW_FILE,
    "first review line\nsecond review line\n",
  );

  return { fileName: REVIEW_FILE, repoPath, workspace };
}

async function openReviewTab(
  user: ReturnType<typeof userEvent.setup>,
  branchName: string,
) {
  render(<Dashboard />);

  await user.click(await findSidebarBranchElement(branchName));

  const reviewTab = await screen.findByRole("tab", { name: /^Review/ });
  await user.click(reviewTab);
  await screen.findByRole("tab", { name: /^Review/, selected: true });
}

async function openReviewWithChange(branchName: string) {
  const fixture = await setupWorkspaceWithChange(branchName);
  return fixture;
}

async function expectCommitCreated(
  repoPath: string,
  workspaceId: number,
  commitMessage: string,
) {
  await waitFor(async () => {
    const log = await listCommits(repoPath, workspaceId, false, undefined, 30);
    expect(
      log.commits.some((commit) => commit.description === commitMessage),
    ).toBe(true);
  });
}

async function addSingleReviewComment(
  user: ReturnType<typeof userEvent.setup>,
  _fileName: string,
  comment: string,
) {
  await user.click(
    (await screen.findAllByRole("button", { name: /add comment/i }))[0],
  );
  await user.type(
    await screen.findByPlaceholderText(/add a comment/i),
    comment,
  );

  const submit = screen
    .getAllByRole("button", { name: /add comment/i })
    .find((button) => button.textContent === "Add Comment");
  expect(submit).toBeTruthy();
  await user.click(submit!);
  await screen.findByText(comment);
}

describe("ShowWorkspace - Reviews integration", () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
  });

  it("is able to create a commit from Review tab", async () => {
    const branchName = "feat/reviews-commit";
    const commitMessage = "Add integration reviews test commit";
    const { repoPath, workspace } = await openReviewWithChange(branchName);
    await openReviewTab(user, branchName);

    await user.type(screen.getByPlaceholderText("Message"), commitMessage);
    await user.click(screen.getByRole("button", { name: /^commit$/i }));
    await expectCommitCreated(repoPath, workspace.id, commitMessage);
  });

  it("is able to review a change and start an agent", async () => {
    const branchName = "feat/reviews-agent";
    const { repoPath, workspace } = await openReviewWithChange(branchName);
    await openReviewTab(user, branchName);
    const createSessionSpy = vi.spyOn(api, "createSession");

    await addSingleReviewComment(
      user,
      REVIEW_FILE,
      "Please tighten this change",
    );
    await user.click(
      await screen.findByRole("button", { name: /finish review/i }),
    );
    await user.click(await screen.findByRole("button", { name: /^plan$/i }));

    await waitFor(() => {
      expect(createSessionSpy).toHaveBeenCalledWith(
        repoPath,
        workspace.id,
        "Code Review",
      );
    });
  });

  it("is able to mark files as viewed and expand/collapse files", async () => {
    const branchName = "feat/reviews-viewed";
    await openReviewWithChange(branchName);
    await openReviewTab(user, branchName);

    const viewedCheckbox = await screen.findByRole("checkbox", {
      name: "Viewed",
    });
    expect(viewedCheckbox).toHaveAttribute("aria-checked", "false");

    await user.click(viewedCheckbox);
    await waitFor(() => {
      expect(viewedCheckbox).toHaveAttribute("aria-checked", "true");
      expect(
        screen.getByRole("button", { name: "Expand file diff" }),
      ).toBeInTheDocument();
    });

    await user.click(viewedCheckbox);
    await waitFor(() => {
      expect(viewedCheckbox).toHaveAttribute("aria-checked", "false");
      expect(
        screen.getByRole("button", { name: "Collapse file diff" }),
      ).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole("button", { name: "Collapse file diff" }),
    );
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Expand file diff" }),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Expand file diff" }));
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Collapse file diff" }),
      ).toBeInTheDocument();
    });
  });
});
