import * as React from "react";
import { expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import {
	createTestRepo,
	openRepo,
	resolveWorkspacePath,
	writeWorkspaceFile,
} from "../../../test/utils";
import { render, screen, waitFor, within } from "../../../test/test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import { getWorkspaces } from "../../../src/lib/api";
import { captureDocument } from "../capture";

const BRANCH_NAME = "feat/commit-draft-persistence";
const DRAFT_TEXT = "Draft message that must survive a tab switch";

// Scenario: the user starts typing a commit message on the Changes tab, then
// switches to the Code tab and back without committing. The Changes tab's
// content (including CommitInput) fully unmounts on tab switch, so the draft
// must be persisted outside of CommitInput's own React state or it is lost.
it("keeps the commit message draft after switching away from and back to the Changes tab", async () => {
	const { repoPath } = createTestRepo(false);
	openRepo(repoPath);

	const user = userEvent.setup();
	render(<Dashboard />);

	await screen.findByTestId("show-workspace-header");
	await user.click(await screen.findByRole("button", { name: "Stack" }));
	const dialog = await screen.findByTestId("modal");
	await user.type(within(dialog).getByLabelText("Branch Name"), BRANCH_NAME);
	await user.click(
		within(dialog).getByRole("button", { name: "Create Workspace" }),
	);
	await waitFor(() => {
		expect(screen.queryByTestId("modal")).not.toBeInTheDocument();
	});

	const header = await screen.findByTestId("show-workspace-header");
	await within(header).findByText(BRANCH_NAME);

	const workspace = (await getWorkspaces(repoPath)).find(
		(candidate) => candidate.branch_name === BRANCH_NAME,
	);
	if (!workspace) {
		throw new Error(`Expected ${BRANCH_NAME} workspace to exist`);
	}
	writeWorkspaceFile(
		resolveWorkspacePath(repoPath, workspace.workspace_path),
		"draft-fixture.txt",
		"a line to make the workspace show changed files\n",
	);

	await user.click(await screen.findByRole("tab", { name: /^Changes/ }));
	await screen.findAllByText("draft-fixture.txt");

	await user.type(await screen.findByPlaceholderText("Message"), DRAFT_TEXT);
	await expect(screen.findByPlaceholderText("Message")).resolves.toHaveValue(
		DRAFT_TEXT,
	);

	await captureDocument(document, {
		name: "commit-draft-survives-tab-switch-01-typed-in-review",
		expectations: [
			"The Changes tab is active, and the commit message box in the left sidebar contains the text 'Draft message that must survive a tab switch'.",
			"draft-fixture.txt is listed as a changed file in the sidebar.",
		],
	});

	await user.click(await screen.findByRole("tab", { name: "Code" }));
	await screen.findByRole("tab", { name: "Code", selected: true });

	await captureDocument(document, {
		name: "commit-draft-survives-tab-switch-02-code-tab",
		expectations: [
			"The Code tab is now active instead of Review -- the file sidebar and commit message box from the Changes tab are no longer shown.",
		],
	});

	await user.click(await screen.findByRole("tab", { name: /^Changes/ }));
	await screen.findByRole("tab", { name: /^Changes/, selected: true });

	const restoredTextarea = await screen.findByPlaceholderText("Message");
	expect(restoredTextarea).toHaveValue(DRAFT_TEXT);

	await captureDocument(document, {
		name: "commit-draft-survives-tab-switch-03-review-restored",
		expectations: [
			"The Changes tab is active again, and the commit message box still contains 'Draft message that must survive a tab switch' even though the tab was switched away and back.",
		],
	});
}, 60000);
