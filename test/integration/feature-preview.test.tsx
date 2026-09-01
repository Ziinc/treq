import * as React from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestRepo, openRepo } from "../utils";
import { render, screen } from "../test-utils";
import { Dashboard } from "../../src/components/Dashboard";
import userEvent from "@testing-library/user-event";
import { createWorkspace, scheduleWorkspaces } from "../../src/lib/api";
import { previewSettingKey } from "../../src/lib/features";

describe("feature preview settings", () => {
  let user: ReturnType<typeof userEvent.setup>;
  let repoPath: string;

  beforeEach(() => {
    ({ repoPath } = createTestRepo(false));
    openRepo(repoPath);
    user = userEvent.setup();
  });

  async function openFeaturePreview() {
    render(<Dashboard />);
    await user.click(await screen.findByLabelText("Settings"));
    await user.click(
      await screen.findByRole("tab", { name: /feature preview/i }),
    );
    expect(await screen.findByTestId("feature-preview-settings")).toBeTruthy();
  }

  it("lists preview features as documentation links", async () => {
    await openFeaturePreview();
    expect(
      screen.getByRole("button", { name: "Skills installation" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Workspace scheduling" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remote SSH" })).toBeTruthy();
  });

  it("hides the Skills tab when skills installation is off", async () => {
    await openFeaturePreview();
    expect(screen.getByRole("tab", { name: /skills/i })).toBeVisible();
    await user.click(screen.getByLabelText("Skills installation"));
    expect(screen.queryByRole("tab", { name: /^skills$/i })).toBeNull();
  });

  it("hides the Schedule button when workspace scheduling is off", async () => {
    await createWorkspace(repoPath, "feat/preview");
    await openFeaturePreview();
    await user.click(screen.getByLabelText("Workspace scheduling"));
    await user.click(screen.getByRole("button", { name: "Close" }));
    const { findSidebarBranchElement } = await import("../utils");
    await user.click(await findSidebarBranchElement("feat/preview"));
    expect(await screen.findByTestId("show-workspace-header")).toBeTruthy();
    expect(
      screen.queryByTestId("schedule-workspace-button"),
    ).not.toBeInTheDocument();
  });
});

describe("feature preview onboarding", () => {
  it("hides Open via SSH when remote SSH is off", async () => {
    const { setSetting } = await import("../../src/lib/api");
    await setSetting(previewSettingKey("remoteSsh"), "false");
    const { useFeaturePreviewStore } = await import(
      "../../src/stores/featurePreviewStore"
    );
    useFeaturePreviewStore.getState().hydrateFlags({
      [previewSettingKey("remoteSsh")]: "false",
    });
    window.history.replaceState({}, "", "/");
    render(<Dashboard />);
    expect(
      await screen.findByRole("button", { name: "Open Repository" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Open via SSH" }),
    ).not.toBeInTheDocument();
  });
});

describe("feature preview rust gates", () => {
  it("rejects schedule_workspaces when the preview flag is off", async () => {
    const { repoPath } = createTestRepo(false);
    const workspaceId = await createWorkspace(repoPath, "feat/gated");
    const { setSetting } = await import("../../src/lib/api");
    await setSetting(previewSettingKey("workspaceScheduling"), "false");
    await expect(
      scheduleWorkspaces(repoPath, [workspaceId], "2099-01-01T00:00:00Z"),
    ).rejects.toThrow(/workspaceScheduling/);
  });
});
