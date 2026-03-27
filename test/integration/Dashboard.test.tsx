/**
 * Integration test: Dashboard renders the workspace list from real Rust backend.
 *
 * Uses createTestRepo() to spin up a real jj repo, creates workspaces via
 * createWorkspace(), then renders Dashboard and asserts
 * that the branch names appear in the sidebar.
 *
 * "Not implemented" jj_* commands (jjGetCurrentBranch, jjGitFetch,
 * jjTrackWorkspaceBookmarks) are called by Dashboard on mount but are wrapped
 * in try/catch, so their failures are logged and do not block rendering.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import * as React from "react";
import { render, screen, waitFor } from "../test-utils";
import { createTestRepo, openRepo } from "../utils";
import { createWorkspace } from "../../src/lib/api";
import { Dashboard } from "../../src/components/Dashboard";

// ── Stub heavy sub-components not relevant to this test ───────────────────────
// Using plain div stubs avoids pulling in xterm.js and other heavy deps.

// vi.mock("../../src/components/WorkspaceTerminalPane", async () => {
//   const { forwardRef } = await import("react");
//   return {
//     WorkspaceTerminalPane: forwardRef(function MockTerminalPane() {
//       return <div data-testid="mock-terminal-pane" />;
//     }),
//   };
// });

vi.mock("../../src/components/ShowWorkspace", () => ({
  ShowWorkspace: () => <div data-testid="mock-show-workspace" />,
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Dashboard - workspace list", () => {
  let repoPath: string;

  beforeEach(async () => {
    ({ repoPath } = createTestRepo(false));

    openRepo(repoPath);

    await createWorkspace(repoPath, "feat/alpha");
    await createWorkspace(repoPath, "feat/beta");
  });

  it("renders workspace branch names in the sidebar", async () => {
    render(<Dashboard />);

    await waitFor(
      () => {
        expect(screen.getByText("feat/alpha")).toBeTruthy();
        expect(screen.getByText("feat/beta")).toBeTruthy();
      }
    );
  });
});
