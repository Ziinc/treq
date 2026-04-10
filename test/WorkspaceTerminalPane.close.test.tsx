import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "./test-utils";
import type { ClaudeSessionData } from "../src/components/terminal/types";
import React from "react";
import { WorkspaceTerminalPane } from "../src/components/WorkspaceTerminalPane";
import { ptyClose } from "../src/lib/api";
import { userEvent } from "@testing-library/user-event";

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
	ptySessionId: `claude-pty-${id}`,
	repoPath: "/test/repo",
	sessionId: id,
	sessionName: `Session ${id}`,
	workspaceName: "ws1",
	workspacePath: "/test/repo/.treq/workspaces/ws1",
});

let user: ReturnType<typeof userEvent.setup>;

beforeEach(() => {
	user = userEvent.setup();
});

describe("WorkspaceTerminalPane close buttons", () => {
	it("calls onCloseSession and ptyClose when Claude close button is clicked", async () => {
		const onCloseSession = vi.fn();
		const session = makeSession(1);

		render(
			<WorkspaceTerminalPane
				workingDirectory="/test/repo"
				claudeSessions={[session]}
				activeClaudeSessionId={1}
				onCloseSession={onCloseSession}
			/>,
		);

		const closeButton = screen.getByLabelText("Close session");
		await user.click(closeButton);

		expect(onCloseSession).toHaveBeenCalledWith(1);
		expect(ptyClose).toHaveBeenCalledWith(session.ptySessionId);
	});

	it("removes shell terminal from DOM and calls ptyClose when shell close button is clicked", async () => {
		render(
			<WorkspaceTerminalPane
				workingDirectory="/test/repo"
				claudeSessions={[]}
				activeClaudeSessionId={null}
			/>,
		);

		// Add a shell terminal via the "New Shell" button
		const newShellButton = screen.getByLabelText("New Shell");
		await user.click(newShellButton);

		expect(screen.getByTestId("shell-terminal-panel")).toBeInTheDocument();

		const closeButton = screen.getByLabelText("Close shell");
		await user.click(closeButton);

		expect(
			screen.queryByTestId("shell-terminal-panel"),
		).not.toBeInTheDocument();
		expect(ptyClose).toHaveBeenCalled();
	});
});
