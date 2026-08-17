import * as React from "react";
import { expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import {
	commitWorkspaceFile,
	createTestRepo,
	openRepo,
} from "../../../test/utils";
import { render, screen, waitFor, within } from "../../../test/test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import { getWorkspaces } from "../../../src/lib/api";
import { captureDocument } from "../capture";

const BRANCH_NAME = "feat/edit-timestamp-demo";

it("captures editing a mutable commit timestamp from the Commits tab", async () => {
	const { repoPath } = createTestRepo(false);
	openRepo(repoPath);

	const user = userEvent.setup();
	render(<Dashboard />);

	await screen.findByTestId("show-workspace-header");
	await user.click(await screen.findByRole("button", { name: "Stack" }));

	const createDialog = await screen.findByTestId("modal");
	const branchNameInput = within(createDialog).getByLabelText("Branch Name");
	await user.type(branchNameInput, BRANCH_NAME);
	await user.click(
		within(createDialog).getByRole("button", { name: "Create Workspace" }),
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

	await commitWorkspaceFile(
		repoPath,
		{ id: workspace.id, path: workspace.workspace_path },
		"workspace-file-1.txt",
		"workspace commit content 1",
		"Timestamp commit A",
	);
	await commitWorkspaceFile(
		repoPath,
		{ id: workspace.id, path: workspace.workspace_path },
		"workspace-file-2.txt",
		"workspace commit content 2",
		"Timestamp commit B",
	);

	await user.click(await screen.findByRole("tab", { name: /^Commits/ }));
	await screen.findByText("Timestamp commit B");
	await screen.findByTestId("shift-commits-to-now");

	await captureDocument(document, {
		name: "edit-commit-timestamp-00-shift-to-now",
		expectations: [
			"The Commits tab lists Timestamp commit A and Timestamp commit B.",
			"A 'Shift to now' helper button is visible at the top of the commit list.",
		],
	});

	const commitRow = await screen.findByText("Timestamp commit A");
	await user.click(commitRow);
	await screen.findByRole("button", { name: "Edit timestamp" });

	await captureDocument(document, {
		name: "edit-commit-timestamp-01-expanded-row",
		expectations: [
			"The Commits tab shows the expanded 'Timestamp commit A' row with action buttons.",
			"An 'Edit timestamp' button appears next to 'Edit description'.",
		],
	});

	await user.click(
		await screen.findByRole("button", { name: "Edit timestamp" }),
	);
	const editDialog = await screen.findByTestId("modal");
	await within(editDialog).findByText("Edit commit timestamp");

	await captureDocument(document, {
		name: "edit-commit-timestamp-02-dialog-open",
		expectations: [
			"A dialog titled 'Edit commit timestamp' is open.",
			"Shift by duration is selected, with Days, Hours, and Minutes fields and Forward/Back toggles.",
			"A 'Shift stack to now' helper button is visible in the dialog footer.",
		],
	});

	const daysInput = within(editDialog).getByLabelText("Days");
	await user.clear(daysInput);
	await user.type(daysInput, "2");
	await user.click(within(editDialog).getByRole("button", { name: "Apply" }));

	await waitFor(() => {
		expect(screen.queryByTestId("modal")).not.toBeInTheDocument();
	});
	await screen.findByText("Timestamp updated");

	await captureDocument(document, {
		name: "edit-commit-timestamp-03-after-apply",
		expectations: [
			"The timestamp dialog is closed and a success toast reads 'Timestamp updated'.",
			"Commit rows remain listed under day headings after the shift.",
		],
	});
}, 60000);
