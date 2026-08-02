import * as React from "react";
import { it } from "vitest";
import userEvent from "@testing-library/user-event";
import { createTestRepo, openRepo } from "../../../test/utils";
import { render, screen, within } from "../../../test/test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import { createWorkspace } from "../../../src/lib/api";
import { captureDocument } from "../capture";

// Reference template for /app-qa specs: every interaction goes through
// @testing-library/user-event (never fireEvent) so it replays the real
// pointer/focus/keyboard event sequence. screen.findBy*/expect calls prove
// the DOM reached the right state before each capture; the `expectations`
// passed to captureDocument are separate -- plain-English claims about what
// the screenshot itself should show, for an agent to verify by looking at
// the image.
it("captures switching the home repo branch via the header dropdown", async () => {
	const { repoPath, defaultBranch } = createTestRepo(false);
	openRepo(repoPath);
	await createWorkspace(repoPath, "feat/alpha");
	await createWorkspace(repoPath, "feat/beta");

	const user = userEvent.setup();
	render(<Dashboard />);

	const header = await screen.findByTestId("show-workspace-header");
	await within(header).findByRole("button", { name: defaultBranch });
	await captureDocument(document, {
		name: "workspace-branch-switch-01-before",
		expectations: [
			`The header's branch button reads "${defaultBranch}".`,
			"No modal or dropdown is open.",
		],
	});

	const branchButton = await within(header).findByRole("button", {
		name: defaultBranch,
	});
	await user.click(branchButton);

	const modal = await screen.findByTestId("modal");
	await within(modal).findByText("feat/alpha");
	await within(modal).findByText("feat/beta");
	await captureDocument(document, {
		name: "workspace-branch-switch-02-modal-open",
		expectations: [
			"A branch-switch modal/dropdown is open, listing branches to switch to.",
			'The list includes both "feat/alpha" and "feat/beta".',
		],
	});

	await user.click(within(modal).getByText("feat/alpha"));
	await within(header).findByRole("button", { name: "feat/alpha" });
	await captureDocument(document, {
		name: "workspace-branch-switch-03-after-switch",
		expectations: [
			'The header\'s branch button now reads "feat/alpha".',
			"The branch-switch modal/dropdown has closed.",
		],
	});
}, 60000);
