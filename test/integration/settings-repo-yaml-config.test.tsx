import * as React from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestRepo, openRepo, writeRepoFile } from "../utils";
import { render, screen } from "../test-utils";
import { Dashboard } from "../../src/components/Dashboard";
import userEvent from "@testing-library/user-event";

describe("Repository YAML config sync", () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
  });

  it("loads and displays settings synced from .treq/config.yaml", async () => {
    const { repoPath } = createTestRepo(false);
    await writeRepoFile(
      repoPath,
      ".treq/config.yaml",
      [
        "target_branch: main",
        "default_model: opus",
        "default_agent: claude",
      ].join("\n"),
    );
    openRepo(repoPath);

    render(<Dashboard />);

    await user.click(await screen.findByLabelText("Settings"));
    await user.click(await screen.findByRole("tab", { name: /repository/i }));

    await screen.findByText(/synced from \.treq\/config\.yaml/i);
    expect(await screen.findByText("Target Branch")).toBeVisible();
    expect(screen.getByText("opus")).toBeVisible();
    expect(screen.getByText("claude")).toBeVisible();
    const targetBranchRow = screen.getByText("Target Branch").closest("div");
    expect(targetBranchRow).toHaveTextContent("main");
  });

  it("shows a message when no .treq/config.yaml file exists", async () => {
    const { repoPath } = createTestRepo(false);
    openRepo(repoPath);

    render(<Dashboard />);

    await user.click(await screen.findByLabelText("Settings"));
    await user.click(await screen.findByRole("tab", { name: /repository/i }));

    await screen.findByText(/no \.treq\/config\.yaml found/i);
  });

  it("re-syncs from disk when Reload is clicked", async () => {
    const { repoPath } = createTestRepo(false);
    openRepo(repoPath);

    render(<Dashboard />);

    await user.click(await screen.findByLabelText("Settings"));
    await user.click(await screen.findByRole("tab", { name: /repository/i }));

    await screen.findByText(/no \.treq\/config\.yaml found/i);

    await writeRepoFile(
      repoPath,
      ".treq/config.yaml",
      "target_branch: develop\n",
    );

    await user.click(await screen.findByRole("button", { name: /reload/i }));

    expect(await screen.findByText("develop")).toBeVisible();
  });
});
