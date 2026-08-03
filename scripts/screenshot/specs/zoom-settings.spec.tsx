import * as React from "react";
import { expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { createTestRepo, openRepo } from "../../../test/utils";
import { render, screen } from "../../../test/test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import { captureDocument } from "../capture";

it("captures UI zoom settings slider and keyboard zoom", async () => {
	const { repoPath } = createTestRepo(false);
	openRepo(repoPath);
	document.documentElement.style.zoom = "100%";

	const user = userEvent.setup();
	render(<Dashboard />);

	await screen.findByLabelText("Settings");
	await captureDocument(document, {
		name: "zoom-settings-01-default",
		expectations: [
			"The dashboard renders at normal scale before any zoom change.",
			"The Settings gear control is visible in the sidebar.",
		],
	});

	await user.click(await screen.findByLabelText("Settings"));
	await user.click(await screen.findByRole("tab", { name: /application/i }));
	const slider = await screen.findByRole("slider");
	expect(slider).toHaveAttribute("aria-valuenow", "100");

	await captureDocument(document, {
		name: "zoom-settings-02-slider",
		expectations: [
			"The Application settings tab is open with a UI Zoom slider.",
			"The zoom value label reads 100%.",
		],
	});

	slider.focus();
	await user.keyboard("{ArrowRight}{ArrowRight}");
	expect(slider).toHaveAttribute("aria-valuenow", "110");

	await user.click(screen.getByRole("button", { name: /save settings/i }));
	await screen.findByText("Settings Saved");
	expect(document.documentElement.style.zoom).toBe("110%");

	await captureDocument(document, {
		name: "zoom-settings-03-after-save",
		expectations: [
			"The settings page still shows the Application tab after saving.",
			"The UI Zoom slider reflects 110%.",
		],
	});
}, 60000);
