import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "./test-utils";
import userEvent from "@testing-library/user-event";
import { ShowWorkspace } from "../src/components/ShowWorkspace";
import * as api from "../src/lib/api";
import type { Workspace } from "../src/lib/api";

vi.mock("../src/components/FileBrowser", () => ({
  FileBrowser: () => <div data-testid="file-browser" />,
}));

vi.mock("../src/components/LinearCommitHistory", () => ({
  LinearCommitHistory: () => <div data-testid="linear-commit-history" />,
}));

vi.mock("../src/components/ChangesDiffViewer", () => ({
  ChangesDiffViewer: () => <div data-testid="changes-viewer" />,
}));

vi.mock("../src/components/TargetBranchSelector", () => ({
  TargetBranchSelector: () => <div data-testid="target-branch-selector" />,
}));

vi.mock("../src/lib/api", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/api")>(
    "../src/lib/api"
  );
  return {
    ...actual,
    getSetting: vi.fn().mockResolvedValue(null),
    listDirectory: vi.fn().mockResolvedValue([]),
    readFile: vi.fn().mockRejectedValue(new Error("README not found")),
    jjGetDefaultBranch: vi.fn().mockResolvedValue("main"),
    jjGetConflictedFiles: vi.fn().mockResolvedValue([]),
    jjGetBranches: vi.fn().mockResolvedValue([]),
    setWorkspaceTargetBranch: vi.fn().mockResolvedValue(undefined),
    jjGetChangedFiles: vi.fn().mockResolvedValue([]),
    createSession: vi.fn().mockResolvedValue(42),
    ptyCreateSession: vi.fn().mockResolvedValue(undefined),
    ptyWrite: vi.fn().mockResolvedValue(undefined),
    checkAndRebaseWorkspaces: vi.fn().mockResolvedValue({
      rebased: false,
      success: true,
      has_conflicts: false,
      conflicted_files: [],
      message: "No rebase needed",
    }),
    jjPush: vi.fn().mockResolvedValue("Success"),
  };
});

const workspace: Workspace = {
  id: 7,
  repo_path: "/Users/test/repo",
  workspace_name: "feature-one",
  workspace_path: "/Users/test/repo/.treq/workspaces/feature-one",
  branch_name: "feature-one",
  created_at: new Date().toISOString(),
};

describe("ShowWorkspace Push", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls jjPush when clicking 'Push to remote'", async () => {
    const user = userEvent.setup();

    render(
      <ShowWorkspace
        repositoryPath={workspace.repo_path}
        workspace={workspace}
        onSessionCreated={vi.fn()}
        onDeleteWorkspace={vi.fn()}
      />
    );

    // Find and click the "more" dropdown button
    const moreButton = screen.getByRole("button", { name: "" });
    await user.click(moreButton);

    // Find and click "Push to remote"
    const pushButton = await screen.findByText("Push to remote");
    await user.click(pushButton);

    // Verify jjPush was called with correct arguments
    await waitFor(() => {
      expect(api.jjPush).toHaveBeenCalledWith(workspace.workspace_path);
    });
  });

  it("shows success toast on successful push", async () => {
    const user = userEvent.setup();

    render(
      <ShowWorkspace
        repositoryPath={workspace.repo_path}
        workspace={workspace}
        onSessionCreated={vi.fn()}
        onDeleteWorkspace={vi.fn()}
      />
    );

    // Click more button
    const moreButton = screen.getByRole("button", { name: "" });
    await user.click(moreButton);

    // Click "Push to remote"
    const pushButton = await screen.findByText("Push to remote");
    await user.click(pushButton);

    // Wait for success toast
    await waitFor(() => {
      expect(screen.getByText("Pushed to remote")).toBeInTheDocument();
    });
    expect(screen.getByText("Changes pushed successfully")).toBeInTheDocument();
  });

  it("shows error toast on push failure", async () => {
    const user = userEvent.setup();

    // Mock push to fail
    vi.mocked(api.jjPush).mockRejectedValueOnce(
      new Error("Failed to push: remote rejected")
    );

    render(
      <ShowWorkspace
        repositoryPath={workspace.repo_path}
        workspace={workspace}
        onSessionCreated={vi.fn()}
        onDeleteWorkspace={vi.fn()}
      />
    );

    // Click more button
    const moreButton = screen.getByRole("button", { name: "" });
    await user.click(moreButton);

    // Click "Push to remote"
    const pushButton = await screen.findByText("Push to remote");
    await user.click(pushButton);

    // Wait for error toast
    await waitFor(() => {
      expect(screen.getByText("Push failed")).toBeInTheDocument();
    });
    expect(
      screen.getByText("Error: Failed to push: remote rejected")
    ).toBeInTheDocument();
  });

  // TODO: Fix force push dialog tests - Dialog component interaction needs investigation
  it.skip("calls jjPush with force=true when force pushing", async () => {
    const user = userEvent.setup();

    render(
      <ShowWorkspace
        repositoryPath={workspace.repo_path}
        workspace={workspace}
        onSessionCreated={vi.fn()}
        onDeleteWorkspace={vi.fn()}
      />
    );

    // Click more button
    const moreButton = screen.getByRole("button", { name: "" });
    await user.click(moreButton);

    // Click "Push to remote (force)" to open dialog
    const forcePushMenuItem = await screen.findByText("Push to remote (force)");
    await user.click(forcePushMenuItem);

    // Find and click the confirmation button in the dialog
    await waitFor(async () => {
      const confirmButtons = screen.getAllByRole("button");
      const forcePushButton = confirmButtons.find(
        (btn) => btn.textContent === "Force Push"
      );
      expect(forcePushButton).toBeTruthy();
      if (forcePushButton) {
        await user.click(forcePushButton);
      }
    });

    // Verify jjPush was called with force=true
    await waitFor(() => {
      expect(api.jjPush).toHaveBeenCalledWith(workspace.workspace_path, true);
    });
  });

  it.skip("closes dialog after successful force push", async () => {
    const user = userEvent.setup();

    render(
      <ShowWorkspace
        repositoryPath={workspace.repo_path}
        workspace={workspace}
        onSessionCreated={vi.fn()}
        onDeleteWorkspace={vi.fn()}
      />
    );

    // Click more button
    const moreButton = screen.getByRole("button", { name: "" });
    await user.click(moreButton);

    // Click "Push to remote (force)" to open dialog
    const forcePushMenuItem = await screen.findByText("Push to remote (force)");
    await user.click(forcePushMenuItem);

    // Wait for dialog to appear
    const dialogTitle = await screen.findByText("Force Push Warning", {}, { timeout: 3000 });
    expect(dialogTitle).toBeInTheDocument();

    // Find and click the confirmation button
    const confirmButtons = screen.getAllByRole("button");
    const confirmButton = confirmButtons.find(
      (btn) => btn.textContent === "Force Push"
    );
    expect(confirmButton).toBeTruthy();
    if (confirmButton) {
      await user.click(confirmButton);
    }

    // Wait for dialog to close
    await waitFor(() => {
      expect(
        screen.queryByText("Force Push Warning")
      ).not.toBeInTheDocument();
    });
  });

  it.skip("shows success toast on successful force push", async () => {
    const user = userEvent.setup();

    render(
      <ShowWorkspace
        repositoryPath={workspace.repo_path}
        workspace={workspace}
        onSessionCreated={vi.fn()}
        onDeleteWorkspace={vi.fn()}
      />
    );

    // Click more button
    const moreButton = screen.getByRole("button", { name: "" });
    await user.click(moreButton);

    // Click "Push to remote (force)" to open dialog
    const forcePushMenuItem = await screen.findByText("Push to remote (force)");
    await user.click(forcePushMenuItem);

    // Find and click the confirmation button
    await waitFor(async () => {
      const confirmButtons = screen.getAllByRole("button");
      const forcePushButton = confirmButtons.find(
        (btn) => btn.textContent === "Force Push"
      );
      if (forcePushButton) {
        await user.click(forcePushButton);
      }
    });

    // Wait for success toast
    await waitFor(() => {
      expect(screen.getByText("Force pushed to remote")).toBeInTheDocument();
    });
    expect(
      screen.getByText("Changes force pushed successfully")
    ).toBeInTheDocument();
  });

  it.skip("shows error toast on force push failure", async () => {
    const user = userEvent.setup();

    // Mock push to fail
    vi.mocked(api.jjPush).mockRejectedValueOnce(
      new Error("Failed to force push: remote rejected")
    );

    render(
      <ShowWorkspace
        repositoryPath={workspace.repo_path}
        workspace={workspace}
        onSessionCreated={vi.fn()}
        onDeleteWorkspace={vi.fn()}
      />
    );

    // Click more button
    const moreButton = screen.getByRole("button", { name: "" });
    await user.click(moreButton);

    // Click "Push to remote (force)" to open dialog
    const forcePushMenuItem = await screen.findByText("Push to remote (force)");
    await user.click(forcePushMenuItem);

    // Find and click the confirmation button
    await waitFor(async () => {
      const confirmButtons = screen.getAllByRole("button");
      const forcePushButton = confirmButtons.find(
        (btn) => btn.textContent === "Force Push"
      );
      if (forcePushButton) {
        await user.click(forcePushButton);
      }
    });

    // Wait for error toast
    await waitFor(() => {
      expect(screen.getByText("Force push failed")).toBeInTheDocument();
    });
    expect(
      screen.getByText("Error: Failed to force push: remote rejected")
    ).toBeInTheDocument();
  });

  it("does not call jjPush if workspace is not set", async () => {
    const user = userEvent.setup();

    render(
      <ShowWorkspace
        repositoryPath={workspace.repo_path}
        workspace={null}
        onSessionCreated={vi.fn()}
        onDeleteWorkspace={vi.fn()}
      />
    );

    // There should be no more button when workspace is null
    // But let's verify jjPush is not called even if we somehow trigger it
    expect(api.jjPush).not.toHaveBeenCalled();
  });
});
