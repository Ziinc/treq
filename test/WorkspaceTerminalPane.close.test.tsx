import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "./test-utils";
import React from "react";
import { WorkspaceTerminalPane } from "../src/components/WorkspaceTerminalPane";
import type { ClaudeSessionData } from "../src/components/terminal/types";
import { ptyClose } from "../src/lib/api";

vi.mock("../src/components/terminal/ClaudeTerminalPanel", () => ({
  ClaudeTerminalPanel: ({ onClose }: { onClose?: () => void }) => (
    <div data-testid="claude-terminal-panel">
      {onClose && (
        <button aria-label="Close session" onClick={onClose}>
          Close
        </button>
      )}
    </div>
  ),
}));
vi.mock("../src/components/terminal/ShellTerminalPanel", () => ({
  ShellTerminalPanel: ({ onClose }: { onClose?: () => void }) => (
    <div data-testid="shell-terminal-panel">
      {onClose && (
        <button aria-label="Close shell" onClick={onClose}>
          Close
        </button>
      )}
    </div>
  ),
}));
vi.mock("../src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/api")>();
  return { ...actual, ptyClose: vi.fn().mockResolvedValue(undefined) };
});

const makeSession = (id: number): ClaudeSessionData => ({
  sessionId: id,
  ptySessionId: `claude-pty-${id}`,
  repoPath: "/test/repo",
  workspacePath: "/test/repo/.treq/workspaces/ws1",
  workspaceName: "ws1",
  sessionName: `Session ${id}`,
});

describe("WorkspaceTerminalPane close buttons", () => {
  it("calls onCloseSession and ptyClose when Claude close button is clicked", () => {
    const onCloseSession = vi.fn();
    const session = makeSession(1);

    render(
      <WorkspaceTerminalPane
        workingDirectory="/test/repo"
        claudeSessions={[session]}
        activeClaudeSessionId={1}
        onCloseSession={onCloseSession}
      />
    );

    const closeButton = screen.getByLabelText("Close session");
    fireEvent.click(closeButton);

    expect(onCloseSession).toHaveBeenCalledWith(1);
    expect(ptyClose).toHaveBeenCalledWith(session.ptySessionId);
  });

  it("removes shell terminal from DOM and calls ptyClose when shell close button is clicked", async () => {
    render(
      <WorkspaceTerminalPane
        workingDirectory="/test/repo"
        claudeSessions={[]}
        activeClaudeSessionId={null}
      />
    );

    // Add a shell terminal via the "New Shell" button
    const newShellButton = screen.getByLabelText("New Shell");
    fireEvent.click(newShellButton);

    expect(screen.getByTestId("shell-terminal-panel")).toBeInTheDocument();

    const closeButton = screen.getByLabelText("Close shell");
    fireEvent.click(closeButton);

    expect(screen.queryByTestId("shell-terminal-panel")).not.toBeInTheDocument();
    expect(ptyClose).toHaveBeenCalled();
  });
});
