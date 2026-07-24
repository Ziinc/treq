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
// pointer/focus/keyboard event sequence, and each meaningful step in the
// flow gets its own numbered before/during/after capture.
it("captures switching the home repo branch via the header dropdown", async () => {
	const { repoPath, defaultBranch } = createTestRepo(false);
	openRepo(repoPath);
	await createWorkspace(repoPath, "feat/alpha");
	await createWorkspace(repoPath, "feat/beta");

	const user = userEvent.setup();
	render(<Dashboard />);

	const header = await screen.findByTestId("show-workspace-header");
	await captureDocument(document, { name: "workspace-branch-switch-01-before" });

	const branchButton = await within(header).findByRole("button", {
		name: defaultBranch,
	});
	await user.click(branchButton);

	const modal = await screen.findByTestId("modal");
	await within(modal).findByText("feat/alpha");
	await captureDocument(document, {
		name: "workspace-branch-switch-02-modal-open",
	});

	await user.click(within(modal).getByText("feat/alpha"));
	await within(header).findByRole("button", { name: "feat/alpha" });
	await captureDocument(document, {
		name: "workspace-branch-switch-03-after-switch",
	});
}, 60000);
