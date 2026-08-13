/**
 * Captures the keyboard shortcuts reference modal opened via ?.
 */

import * as React from "react";
import { expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { createTestRepo, openRepo } from "../../../test/utils";
import { render, screen, within } from "../../../test/test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import { captureDocument } from "../capture";

it("opens the keyboard shortcuts modal with ?", async () => {
	const { repoPath } = createTestRepo(false);
	openRepo(repoPath);

	const user = userEvent.setup();
	render(<Dashboard />);

	await screen.findByTestId("show-workspace-header");

	const active = document.activeElement;
	if (active instanceof HTMLElement) active.blur();
	await user.click(document.body);

	await captureDocument(document, {
		name: "keyboard-shortcuts-modal-01-before",
		expectations: [
			"Home workspace view is visible with the sidebar and main content.",
			"No keyboard shortcuts modal overlay is open.",
		],
	});

	await user.keyboard("?");

	const modal = await screen.findByTestId("keyboard-shortcuts-modal");
	expect(within(modal).getByText("Keyboard shortcuts")).toBeTruthy();
	expect(within(modal).getByText("Command Palette")).toBeTruthy();

	await captureDocument(document, {
		name: "keyboard-shortcuts-modal-02-open",
		expectations: [
			"A centered modal titled Keyboard shortcuts is open over a dimmed backdrop.",
			"Shortcut rows show actions like New workspace and Command Palette with ⌘ kbd badges.",
			"Shortcuts are grouped into labeled sections such as Global and Terminal.",
		],
	});
}, 60000);
