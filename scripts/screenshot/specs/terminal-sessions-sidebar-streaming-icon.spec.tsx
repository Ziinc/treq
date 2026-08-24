/**
 * Visual QA: a streaming session's sidebar row shows the activity spinner in
 * the same slot as its normal icon (not beside the title), so the title
 * doesn't shift. Renders TerminalSessionsSidebar directly with synthetic
 * session summaries -- the same shape test/TerminalSessionsSidebar.test.tsx
 * uses -- since reproducing real pty streaming output through jsdom's xterm
 * (zero-size container, no real terminal fit) isn't a supported flow here.
 */

import * as React from "react";
import { it } from "vitest";
import { TerminalSessionsSidebar } from "../../../src/components/TerminalSessionsSidebar";
import type { TerminalSessionSummary } from "../../../src/components/terminal/types";
import { TooltipProvider } from "../../../src/components/ui/tooltip";
import { render, screen } from "../../../test/test-utils";
import { captureDocument } from "../capture";

const baseSession: Omit<TerminalSessionSummary, "id" | "kind" | "name"> = {
	branchName: "feat/spinner-demo",
	isMainRepo: false,
	lastActivityAt: Date.now(),
	lastUserInputAt: 0,
	isStreaming: false,
	previewOutput: "",
};

it("shows the activity spinner in place of the session icon while streaming", async () => {
	const sessions: TerminalSessionSummary[] = [
		{
			...baseSession,
			id: "shell-streaming",
			kind: "shell",
			name: "Shell",
			isStreaming: true,
		},
		{
			...baseSession,
			id: "claude-idle",
			kind: "claude",
			agent: "claude",
			name: "Claude",
			isStreaming: false,
		},
	];

	render(
		<TooltipProvider>
			<TerminalSessionsSidebar sessions={sessions} />
		</TooltipProvider>,
	);

	await screen.findByTestId("terminal-session-item-shell-streaming");
	await screen.findByTestId("terminal-session-item-claude-idle");

	await captureDocument(document, {
		name: "terminal-sessions-sidebar-streaming-icon",
		expectations: [
			"The 'Shell' row shows a spinning loader icon (not the terminal icon) directly before the 'Shell' text, in the same slot the icon would otherwise occupy.",
			"The 'Claude' row (not streaming) shows its normal agent icon before the 'Claude' text, with no spinner.",
		],
	});
}, 30000);
