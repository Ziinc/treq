import { it, expect, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import userEvent from "@testing-library/user-event";
import { createTestRepo, openRepo } from "../../../test/utils";
import { render, screen, waitFor } from "../../../test/test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import { createWorkspace } from "../../../src/lib/api";
import { captureDocument } from "../capture";

it("captures bulk archive grey-out, spinners, then toast", async () => {
  vi.mocked(ask).mockResolvedValue(true);
  const originalInvoke = vi.mocked(invoke).getMockImplementation();
  expect(originalInvoke).toBeTruthy();
  let releaseDeletes: (() => void) | undefined;
  const deleteGate = new Promise<void>((resolve) => {
    releaseDeletes = resolve;
  });
  vi.mocked(invoke).mockImplementation(async (cmd, args) => {
    if (cmd === "delete_workspace") {
      await deleteGate;
    }
    return originalInvoke!(cmd, args);
  });

  try {
    const { repoPath } = createTestRepo(false);
    openRepo(repoPath);
    await createWorkspace(repoPath, "feat/alpha");
    await createWorkspace(repoPath, "feat/beta");

    const user = userEvent.setup();
    render(<Dashboard />);

    const alpha = await screen.findByTestId(
      "workspace-sidebar-item-feat/alpha",
    );
    const beta = await screen.findByTestId("workspace-sidebar-item-feat/beta");

    await user.keyboard("{Meta>}");
    await user.click(alpha);
    await user.click(beta);
    await user.keyboard("{/Meta}");

    await screen.findByText(/archive 2 workspaces/i);

    await captureDocument(document, {
      name: "bulk-archive-loading-01-selected",
      expectations: [
        "feat/alpha and feat/beta are highlighted as multi-selected in the sidebar.",
        "An Archive 2 workspaces action is visible at the bottom of the workspace list.",
      ],
    });

    await user.click(await screen.findByText(/archive 2 workspaces/i));

    await waitFor(() => {
      expect(alpha).toHaveAttribute("aria-busy", "true");
    });

    await captureDocument(document, {
      name: "bulk-archive-loading-02-busy",
      expectations: [
        "Both selected workspace rows are greyed out with spinner icons instead of branch icons.",
        "The rows look disabled and are not fully opaque.",
      ],
    });

    releaseDeletes!();
    await screen.findByText(/2 workspaces archived/i);
    await waitFor(() => {
      expect(
        screen.queryByTestId("workspace-sidebar-item-feat/alpha"),
      ).toBeNull();
    });

    await captureDocument(document, {
      name: "bulk-archive-loading-03-archived",
      expectations: [
        "feat/alpha and feat/beta are gone from the sidebar workspace list.",
        "A success toast in the lower left confirms 2 workspaces archived.",
      ],
    });
  } finally {
    vi.mocked(invoke).mockImplementation(originalInvoke!);
    vi.mocked(ask).mockReset();
  }
}, 60000);
