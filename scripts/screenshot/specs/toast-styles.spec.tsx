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
			"Four stacked toasts are visible in the bottom-left corner, and every one of them shares the same neutral card-like surface (light background, subtle border, drop shadow, rounded corners) rather than a solid saturated color fill.",
			"Each toast carries its type icon on the left: a green circular check on 'Synced with remote', a red/destructive circular alert (exclamation) on 'Push failed', a yellow triangle warning on 'Uncommitted changes', and a blue/primary info icon on 'Terminal Restarting'.",
			"Each toast has a bold title line, a smaller muted-colored description line below it, and a small close (X) button on its right edge.",
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
			"The page background is dark (dark mode is active), and the four stacked toasts in the bottom-left corner use a dark neutral surface consistent with the rest of the dark-mode UI, not a solid saturated color fill.",
			"Each toast carries its type icon: a green check on 'Synced with remote', a red/destructive circular alert (exclamation) on 'Push failed', a yellow triangle warning on 'Uncommitted changes', and a blue/primary info icon on 'Terminal Restarting'.",
			"Toast title and description text is legible against the dark background.",
		],
	});
}, 30000);
