import { beforeEach, describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "../../test-utils";
import {
  createTestRepo,
  findSidebarBranchElement,
  openRepo,
  resolveWorkspacePath,
  writeWorkspaceFile,
} from "../../utils";
import * as api from "../../../src/lib/api";
import { Dashboard } from "../../../src/components/Dashboard";
import fs from "node:fs";
import path from "node:path";

async function createDirtyWorkspace(branchName: string, fileName: string) {
  const { repoPath } = createTestRepo(false);
  openRepo(repoPath);

  const workspaceId = await api.createWorkspace(repoPath, branchName);
  const workspace = (await api.getWorkspaces(repoPath)).find(
    (candidate) => candidate.id === workspaceId,
  );
  expect(workspace).toBeTruthy();

  const workspacePath = resolveWorkspacePath(
    repoPath,
    workspace!.workspace_path,
  );
  writeWorkspaceFile(workspacePath, fileName, "dirty working copy content\n");

  return { repoPath, workspace: workspace!, workspacePath };
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

describe("Review tab - discard changes", () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
  });

  it("discards all uncommitted changes from the Review tab", async () => {
    const fileName = "discard-all.txt";
    const { workspacePath } = await createDirtyWorkspace(
      "feat/discard-all",
      fileName,
    );
    await openReviewTab(user, "feat/discard-all");

    await waitFor(() =>
      expect(screen.getAllByText(fileName).length).toBeGreaterThan(0),
    );

    await user.click(
      await screen.findByRole("button", { name: /discard all changes/i }),
    );
    await screen.findByText("Discard all changes?");
    const confirmButtons = screen.getAllByRole("button", {
      name: /discard all changes/i,
    });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(screen.queryAllByText(fileName)).toHaveLength(0);
    });

    expect(fs.existsSync(path.join(workspacePath, fileName))).toBe(false);
  });

  it("discards a selected file from the Review sidebar", async () => {
    const fileName = "discard-one.txt";
    const { workspacePath } = await createDirtyWorkspace(
      "feat/discard-one",
      fileName,
    );
    await openReviewTab(user, "feat/discard-one");

    await waitFor(() =>
      expect(screen.getAllByText(fileName).length).toBeGreaterThan(0),
    );

    const [sidebarFile] = screen.getAllByText(fileName);
    await user.click(sidebarFile);

    await user.click(await screen.findByTitle("Discard selected files"));

    await waitFor(() => {
      expect(screen.queryAllByText(fileName)).toHaveLength(0);
    });

    expect(fs.existsSync(path.join(workspacePath, fileName))).toBe(false);
  });

  it("keeps changes when canceling the discard-all confirmation", async () => {
    const fileName = "discard-cancel.txt";
    const { workspacePath } = await createDirtyWorkspace(
      "feat/discard-cancel",
      fileName,
    );
    await openReviewTab(user, "feat/discard-cancel");

    await waitFor(() =>
      expect(screen.getAllByText(fileName).length).toBeGreaterThan(0),
    );

    await user.click(
      await screen.findByRole("button", { name: /discard all changes/i }),
    );
    await screen.findByText("Discard all changes?");
    await screen.clickByText("Cancel");

    expect(screen.getAllByText(fileName).length).toBeGreaterThan(0);
    expect(screen.queryByText("Discard all changes?")).toBeNull();
    expect(fs.existsSync(path.join(workspacePath, fileName))).toBe(true);
  });

  it("undoes discard-all and restores the previous working-copy changes", async () => {
    const fileName = "discard-undo.txt";
    const { workspacePath } = await createDirtyWorkspace(
      "feat/discard-undo",
      fileName,
    );
    await openReviewTab(user, "feat/discard-undo");

    await waitFor(() =>
      expect(screen.getAllByText(fileName).length).toBeGreaterThan(0),
    );

    await user.click(
      await screen.findByRole("button", { name: /discard all changes/i }),
    );
    await screen.findByText("Discard all changes?");
    const confirmButtons = screen.getAllByRole("button", {
      name: /discard all changes/i,
    });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(screen.queryAllByText(fileName)).toHaveLength(0);
    });
    expect(fs.existsSync(path.join(workspacePath, fileName))).toBe(false);

    await user.click(await screen.findByRole("button", { name: "Undo" }));

    await waitFor(() => {
      expect(screen.getAllByText(fileName).length).toBeGreaterThan(0);
    });
    expect(fs.existsSync(path.join(workspacePath, fileName))).toBe(true);
  });
});
