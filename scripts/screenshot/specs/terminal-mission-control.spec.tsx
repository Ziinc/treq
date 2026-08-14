/**
 * Captures Terminal Mission Control: two-finger swipe up opens a
 * workspace-grouped, activity-sorted two-column card overlay; swipe down
 * (and Escape) close it; selecting a card focuses that terminal.
 */

import * as React from "react";
import { expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import {
	createTestRepo,
	findSidebarBranchElement,
	openRepo,
} from "../../../test/utils";
import { createWorkspace, ptyWrite } from "../../../src/lib/api";
import { render, screen, waitFor } from "../../../test/test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import { TerminalMissionControl } from "../../../src/components/TerminalMissionControl";
import { captureDocument } from "../capture";

const BRANCH_A = "feat/mission-control-a";
const BRANCH_B = "feat/mission-control-b";

function makeTouch(id: number, clientX: number, clientY: number): Touch {
	return {
		identifier: id,
		clientX,
		clientY,
		screenX: clientX,
		screenY: clientY,
		pageX: clientX,
		pageY: clientY,
		radiusX: 0,
		radiusY: 0,
		rotationAngle: 0,
		force: 1,
		target: document.body,
	} as Touch;
}

function dispatchTouch(
	type: "touchstart" | "touchmove" | "touchend",
	touches: Touch[],
	changedTouches: Touch[] = touches,
) {
	const event = new Event(type, { bubbles: true, cancelable: true });
	Object.defineProperty(event, "touches", { value: touches });
	Object.defineProperty(event, "changedTouches", { value: changedTouches });
	Object.defineProperty(event, "targetTouches", { value: touches });
	window.dispatchEvent(event);
}

function twoFingerSwipe(direction: "up" | "down") {
	const startY = direction === "up" ? 360 : 180;
	const endY = direction === "up" ? 200 : 340;
	const start = [makeTouch(0, 120, startY), makeTouch(1, 160, startY + 8)];
	dispatchTouch("touchstart", start);
	dispatchTouch(
		"touchmove",
		start.map((t, i) => makeTouch(i, t.clientX, endY)),
	);
	dispatchTouch(
		"touchend",
		[],
		start.map((t, i) => makeTouch(i, t.clientX, endY)),
	);
}

it("captures Terminal Mission Control open, select, and close", async () => {
	const { repoPath } = createTestRepo(false);
	openRepo(repoPath);
	await createWorkspace(repoPath, BRANCH_A);
	await createWorkspace(repoPath, BRANCH_B);

	const user = userEvent.setup();
	render(<Dashboard />);

	await user.click(await findSidebarBranchElement(BRANCH_A));
	await user.click(await screen.findByLabelText("New shell terminal"));
	await waitFor(() => {
		expect(
			document.querySelector('[data-terminal-id^="shell-"]'),
		).not.toBeNull();
	});

	await user.click(await findSidebarBranchElement(BRANCH_B));
	await user.click(await screen.findByLabelText("New shell terminal"));
	await user.click(await screen.findByLabelText("New agent terminal"));
	await waitFor(() => {
		expect(
			document.querySelectorAll('[data-testid^="terminal-session-item-"]')
				.length,
		).toBeGreaterThanOrEqual(3);
	});

	const shellIds = [
		...document.querySelectorAll<HTMLElement>('[data-terminal-id^="shell-"]'),
	].map((el) => el.getAttribute("data-terminal-id")!);

	await ptyWrite(shellIds[0], "echo mission-a-output\r");
	if (shellIds[1]) {
		await ptyWrite(shellIds[1], "echo mission-b-output\r");
	}

	await captureDocument(document, {
		name: "terminal-mission-control-01-before",
		expectations: [
			"The main workspace view is visible with no Mission Control overlay covering it.",
			"The sidebar Sessions list shows multiple terminal rows for the open shell and agent sessions.",
		],
	});

	twoFingerSwipe("up");
	expect(await screen.findByTestId("terminal-mission-control")).toBeTruthy();
	expect(
		screen.getByTestId(`mission-control-grid-${BRANCH_A}`).className,
	).toContain("grid-cols-2");

	await captureDocument(document, {
		name: "terminal-mission-control-02-open",
		expectations: [
			"A full-screen Mission Control overlay covers the app with a blurred backdrop and a top-right X close button.",
			"Each terminal card has a dark preview pane and a small status icon in the header (not Active/Idle text).",
			"Cards are grouped by workspace in a two-column grid.",
		],
	});

	const shellCard = screen.getAllByTestId(/^mission-control-card-shell-/)[0];
	await user.click(shellCard);
	await waitFor(() => {
		expect(
			screen.queryByTestId("terminal-mission-control"),
		).not.toBeInTheDocument();
	});

	await captureDocument(document, {
		name: "terminal-mission-control-03-after-select",
		expectations: [
			"Mission Control is closed after selecting a terminal card; the normal workspace/terminal UI is visible again.",
		],
	});

	twoFingerSwipe("up");
	expect(await screen.findByTestId("terminal-mission-control")).toBeTruthy();
	twoFingerSwipe("down");
	await waitFor(() => {
		expect(
			screen.queryByTestId("terminal-mission-control"),
		).not.toBeInTheDocument();
	});

	twoFingerSwipe("up");
	expect(await screen.findByTestId("terminal-mission-control")).toBeTruthy();
	await user.keyboard("{Escape}");
	await waitFor(() => {
		expect(
			screen.queryByTestId("terminal-mission-control"),
		).not.toBeInTheDocument();
	});
}, 60000);

it("captures Mission Control cards with terminal output previews", async () => {
	const now = Date.now();
	const sessions = [
		{
			id: "shell-feat-b",
			kind: "shell" as const,
			name: "Shell",
			branchName: BRANCH_B,
			isMainRepo: false,
			lastActivityAt: now,
			lastUserInputAt: now,
			isStreaming: true,
			previewOutput: "$ echo mission-b-output\nmission-b-output",
		},
		{
			id: "claude-1",
			kind: "agent" as const,
			name: "Claude 1",
			branchName: BRANCH_B,
			isMainRepo: false,
			agent: "claude" as const,
			lastActivityAt: now - 5_000,
			lastUserInputAt: now - 5_000,
			isStreaming: false,
			previewOutput:
				"Reading files…\nProposed fix for the swipe gesture handler.",
		},
		{
			id: "shell-feat-a",
			kind: "shell" as const,
			name: "Shell",
			branchName: BRANCH_A,
			isMainRepo: false,
			lastActivityAt: now - 120_000,
			lastUserInputAt: 0,
			isStreaming: false,
			previewOutput: "last login: Thu Aug 13\n$ ",
		},
	];

	render(
		<div className="h-screen bg-background text-foreground">
			<TerminalMissionControl
				open
				sessions={sessions}
				diffStatsByWorkspaceKey={
					new Map([
						[BRANCH_B, { insertions: 24, deletions: 7 }],
						[BRANCH_A, { insertions: 3, deletions: 1 }],
					])
				}
				onClose={() => {}}
				onFocus={() => {}}
			/>
		</div>,
	);

	expect(await screen.findByTestId("terminal-mission-control")).toBeTruthy();
	expect(
		screen.getByTestId("mission-control-preview-shell-feat-b"),
	).toHaveTextContent("mission-b-output");
	expect(screen.getByLabelText("Streaming")).toBeTruthy();
	expect(screen.getByLabelText("Idle")).toBeTruthy();
	expect(screen.getByLabelText("Active")).toBeTruthy();
	expect(screen.getByTestId("mission-control-close")).toBeTruthy();
	expect(screen.getByTestId("mission-control-swipe-hint")).toBeTruthy();
	expect(screen.getAllByTestId("workspace-loc-indicator").length).toBe(2);

	await captureDocument(document, {
		name: "terminal-mission-control-04-output-previews",
		expectations: [
			"Mission Control has an X close button top-right and a centered text-sm swipe-down hint pinned at the bottom; there is no Terminals title or session count.",
			"Workspace group headers show branch name with a right-aligned Gerrit-style +N/-M LOC indicator; cards have no footer under the dark output pane.",
			"Card headers are icon + session name with status icon on the right; previews show terminal output text.",
		],
	});
}, 30000);
