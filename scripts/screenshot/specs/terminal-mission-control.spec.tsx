/**
 * Captures Terminal Mission Control: three-finger swipe up opens a
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
import { createWorkspace } from "../../../src/lib/api";
import { render, screen, waitFor } from "../../../test/test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
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

function threeFingerSwipe(direction: "up" | "down") {
	const startY = direction === "up" ? 360 : 180;
	const endY = direction === "up" ? 200 : 340;
	const start = [
		makeTouch(0, 120, startY),
		makeTouch(1, 160, startY + 8),
		makeTouch(2, 200, startY + 4),
	];
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

	await captureDocument(document, {
		name: "terminal-mission-control-01-before",
		expectations: [
			"The main workspace view is visible with no Mission Control overlay covering it.",
			"The sidebar Sessions list shows multiple terminal rows for the open shell and agent sessions.",
		],
	});

	threeFingerSwipe("up");
	expect(await screen.findByTestId("terminal-mission-control")).toBeTruthy();
	expect(
		screen.getByTestId(`mission-control-grid-${BRANCH_A}`).className,
	).toContain("grid-cols-2");

	await captureDocument(document, {
		name: "terminal-mission-control-02-open",
		expectations: [
			"A full-screen Mission Control overlay titled 'Terminals' covers the app with a blurred backdrop.",
			"Terminals are shown as cards in workspace sections with two-column grids; at least feat/mission-control-a and feat/mission-control-b section headers are visible.",
			"Cards show terminal names (Shell / agent) with a small terminal-preview panel and status text.",
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

	threeFingerSwipe("up");
	expect(await screen.findByTestId("terminal-mission-control")).toBeTruthy();
	threeFingerSwipe("down");
	await waitFor(() => {
		expect(
			screen.queryByTestId("terminal-mission-control"),
		).not.toBeInTheDocument();
	});

	threeFingerSwipe("up");
	expect(await screen.findByTestId("terminal-mission-control")).toBeTruthy();
	await user.keyboard("{Escape}");
	await waitFor(() => {
		expect(
			screen.queryByTestId("terminal-mission-control"),
		).not.toBeInTheDocument();
	});
}, 60000);
