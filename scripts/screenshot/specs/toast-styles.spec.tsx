import * as React from "react";
import { it } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen } from "../../../test/test-utils";
import { useToast } from "../../../src/components/ui/toast";
import { captureDocument } from "../capture";

// Toast styling is a pure presentational concern with no backend involvement,
// so this drives the toast context directly (via useToast) rather than a real
// repo/workspace flow, to get all four toast types on screen deterministically.
function ToastHarness() {
	const { addToast } = useToast();

	return (
		<button
			type="button"
			onClick={() => {
				addToast({
					title: "Synced with remote",
					description: "Fetched and pushed changes",
					type: "success",
				});
				addToast({
					title: "Push failed",
					description: "Permission denied (publickey)",
					type: "error",
				});
				addToast({
					title: "Uncommitted changes",
					description: "You have local edits that were not pushed",
					type: "warning",
				});
				addToast({
					title: "Terminal Restarting",
					description: "Using model: default",
					type: "info",
				});
			}}
		>
			Fire toasts
		</button>
	);
}

it("captures all four toast type styles", async () => {
	const user = userEvent.setup();
	render(<ToastHarness />);

	await user.click(await screen.findByRole("button", { name: "Fire toasts" }));

	await screen.findByText("Synced with remote");
	await screen.findByText("Push failed");
	await screen.findByText("Uncommitted changes");
	await screen.findByText("Terminal Restarting");

	await captureDocument(document, {
		name: "toast-styles-01-all-types",
		expectations: [
			"Four stacked toasts are visible in the bottom-left corner of the page.",
			"Every toast shares the same neutral card-like surface (light background, subtle border, drop shadow, rounded corners) rather than a solid saturated color fill.",
			"The 'Synced with remote' toast shows a green circular check icon on its left.",
			"The 'Push failed' toast shows a red/destructive circular alert (exclamation) icon on its left, the same style used for errors elsewhere in the app (e.g. the rename workspace dialog).",
			"The 'Uncommitted changes' toast shows a yellow triangle warning icon on its left, matching the yellow warning color used elsewhere in the app (e.g. the merge dialog's uncommitted-changes banner).",
			"The 'Terminal Restarting' toast shows a blue/primary-colored info icon on its left.",
			"Each toast has a bold title line and a smaller, muted-colored description line below it.",
			"Each toast has a small close (X) button on its right edge.",
		],
	});
}, 30000);

it("captures all four toast type styles in dark mode", async () => {
	const user = userEvent.setup();
	render(<ToastHarness />);
	document.documentElement.classList.add("dark");

	await user.click(await screen.findByRole("button", { name: "Fire toasts" }));

	await screen.findByText("Synced with remote");
	await screen.findByText("Push failed");
	await screen.findByText("Uncommitted changes");
	await screen.findByText("Terminal Restarting");

	await captureDocument(document, {
		name: "toast-styles-02-all-types-dark",
		expectations: [
			"The page background is dark (dark mode is active).",
			"Four stacked toasts are visible in the bottom-left corner, using a dark neutral surface consistent with the rest of the dark-mode UI, not a solid saturated color fill.",
			"The 'Synced with remote' toast shows a green check icon.",
			"The 'Push failed' toast shows a red/destructive circular alert (exclamation) icon.",
			"The 'Uncommitted changes' toast shows a yellow triangle warning icon.",
			"The 'Terminal Restarting' toast shows a blue/primary info icon.",
			"Toast title and description text is legible against the dark background.",
		],
	});
}, 30000);
