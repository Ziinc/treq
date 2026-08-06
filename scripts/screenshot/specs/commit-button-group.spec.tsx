import * as React from "react";
import { expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import {
	commitRepoFile,
	createTestRepo,
	openRepo,
	resolveWorkspacePath,
	writeWorkspaceFile,
} from "../../../test/utils";
import { render, screen, waitFor, within } from "../../../test/test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import { getWorkspaces } from "../../../src/lib/api";
import { captureDocument } from "../capture";

const BRANCH_NAME = "feat/commit-button-group";

// The Commit button in the Review tab's changes sidebar was changed from a
// single button into a split-button group: a primary "Commit" button plus a
// caret dropdown offering "Commit and push" / "Commit and create PR". These
// captures verify the split control renders correctly and that the dropdown
// menu opens with both options.
it("captures the commit split-button group and its dropdown menu", async () => {
	const { repoPath } = createTestRepo(false);
	openRepo(repoPath);

	await commitRepoFile(
		repoPath,
		"repo-file.txt",
		"repo content",
		"Repo baseline commit",
	);

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
	const workspacePath = resolveWorkspacePath(
		repoPath,
		workspace.workspace_path,
	);

	writeWorkspaceFile(workspacePath, "changed.txt", "changed content\n");

	await user.click(await screen.findByRole("tab", { name: /^Review/ }));
	await screen.findByRole("tab", { name: /^Review/, selected: true });
	await waitFor(() =>
		expect(screen.getAllByText("changed.txt").length).toBeGreaterThan(0),
	);

	await user.type(
		await screen.findByPlaceholderText("Message"),
		"A change worth committing",
	);

	await captureDocument(document, {
		name: "commit-button-group-01-default",
		expectations: [
			"The commit sidebar shows a message textarea with typed text, below it a split button: a primary 'Commit' button on the left and a smaller caret (chevron-down) button on the right, sharing one row with no gap between them.",
			"The commit textarea and split button sit above the 'changed.txt' file entry in the Changes section.",
		],
	});

	await user.click(
		await screen.findByRole("button", { name: "More commit options" }),
	);
	await screen.findByRole("menuitem", { name: "Commit and push" });

	await captureDocument(document, {
		name: "commit-button-group-02-dropdown-open",
		expectations: [
			"A dropdown menu is open below the caret button, anchored to the right edge of the split button, listing two items: 'Commit and push' and 'Commit and create PR'.",
			"The dropdown menu is fully visible with no clipping or overflow off the sidebar/panel edge.",
		],
	});
}, 60000);
