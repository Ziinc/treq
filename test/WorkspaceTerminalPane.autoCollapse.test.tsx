import { describe, expect, it, vi } from "vitest";
import { render, screen } from "./test-utils";
import type { ClaudeSessionData } from "../src/components/terminal/types";
import React from "react";
import { WorkspaceTerminalPane } from "../src/components/WorkspaceTerminalPane";

vi.mock("../src/components/terminal/ClaudeTerminalPanel", () => ({
	ClaudeTerminalPanel: () => <div data-testid="claude-terminal-panel" />,
}));
vi.mock("../src/components/terminal/ShellTerminalPanel", () => ({
	ShellTerminalPanel: () => <div data-testid="shell-terminal-panel" />,
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

const isExpanded = () => screen.queryByLabelText("Collapse terminal") !== null;

const renderPane = (
	sessions: ClaudeSessionData[],
	activeId: number | null = null,
) =>
	render(
		<WorkspaceTerminalPane
			workingDirectory="/test/repo"
			claudeSessions={sessions}
			activeClaudeSessionId={activeId}
		/>,
	);

describe("WorkspaceTerminalPane auto-collapse", () => {
	it("auto-collapses when all terminals are closed", () => {
		const s1 = makeSession(1);
		const s2 = makeSession(2);

		const { rerender } = renderPane([s1, s2], 1);
		expect(isExpanded()).toBe(true);

		// Remove one session — still expanded
		rerender(
			<WorkspaceTerminalPane
				workingDirectory="/test/repo"
				claudeSessions={[s2]}
				activeClaudeSessionId={2}
			/>,
		);
		expect(isExpanded()).toBe(true);

		// Remove last session — collapses
		rerender(
			<WorkspaceTerminalPane
				workingDirectory="/test/repo"
				claudeSessions={[]}
				activeClaudeSessionId={null}
			/>,
		);
		expect(isExpanded()).toBe(false);
	});

	it("starts collapsed with no terminals", () => {
		renderPane([], null);
		expect(isExpanded()).toBe(false);
	});
});
