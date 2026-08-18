import * as React from "react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  commitRepoFile,
  createTestRepo,
  findSidebarBranchElement,
  gitCommitRepoFile,
  openRepo,
} from "../utils";
import { createWorkspace, ensureWorkspaceIndexed } from "../../src/lib/api";
import { render, screen, settleReactUpdates, waitFor } from "../test-utils";
import { Dashboard } from "../../src/components/Dashboard";
import userEvent from "@testing-library/user-event";

describe("FilePicker integration", () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(async () => {
    const { repoPath } = createTestRepo(false);
    await commitRepoFile(
      repoPath,
      "src/components/Button.tsx",
      "export const Button = () => {};",
      "add Button",
    );
    await ensureWorkspaceIndexed(repoPath, null, repoPath);
    openRepo(repoPath);
    user = userEvent.setup();
  });

  it("opens via Ctrl+P, shows initial state, searches files, and selects a result", async () => {
    render(<Dashboard />);
    await settleReactUpdates();

    await user.keyboard("{Control>}p{/Control}");

    await screen.findByPlaceholderText("Search files...");
    await screen.findByText(/Button\.tsx/);

    const input = screen.getByPlaceholderText("Search files...");
    await user.clear(input);
    await user.type(input, "Button");

    await screen.findByText(/Button\.tsx/);

    await screen.clickByText(/Button\.tsx/);
    expect(
      screen.queryByPlaceholderText("Search files..."),
    ).not.toBeInTheDocument();

    await waitFor(() => {
      expect(
        document.querySelector('[data-testid="code-line-content"]'),
      ).toHaveTextContent("export const Button = () => {};");
    });
  });

  it("shows 'No files found' for a nonexistent query", async () => {
    render(<Dashboard />);
    await settleReactUpdates();

    await user.keyboard("{Control>}p{/Control}");
    const input = await screen.findByPlaceholderText("Search files...");
    await user.type(input, "zzz_nonexistent_file");

    await screen.findByText("No files found");
  });
});

describe("FilePicker in a workspace", () => {
  let user: ReturnType<typeof userEvent.setup>;
  let repoPath: string;

  beforeEach(async () => {
    ({ repoPath } = createTestRepo(false));
    await gitCommitRepoFile(
      repoPath,
      "src/components/Button.tsx",
      "export const Button = () => {};",
      "add Button",
    );
    await gitCommitRepoFile(
      repoPath,
      "src/components/Modal.tsx",
      "export const Modal = () => {};",
      "add Modal",
    );
    await createWorkspace(repoPath, "feat/search");
    openRepo(repoPath);
    user = userEvent.setup();
  });

  it("lists workspace files on Cmd+P without a prior file-browser index", async () => {
    render(<Dashboard />);
    await user.click(await findSidebarBranchElement("feat/search"));
    await screen.findByTestId("show-workspace-header");
    await settleReactUpdates();

    await user.keyboard("{Control>}p{/Control}");

    const input = await screen.findByPlaceholderText("Search files...");
    await screen.findByText(/Button\.tsx/);
    await screen.findByText(/Modal\.tsx/);

    await user.clear(input);
    await user.type(input, "Button");

    await screen.findByText(/Button\.tsx/);
    await waitFor(() => {
      expect(screen.queryByText(/Modal\.tsx/)).not.toBeInTheDocument();
    });
  });
});
