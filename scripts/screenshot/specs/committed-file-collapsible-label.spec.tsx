import * as React from "react";
import { expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import {
	commitWorkspaceFile,
	createTestRepo,
	openRepo,
	resolveWorkspacePath,
	writeWorkspaceFile,
} from "../../../test/utils";
import { render, screen, waitFor, within } from "../../../test/test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import { getWorkspaces } from "../../../src/lib/api";
import { captureDocument } from "../capture";

const BRANCH_NAME = "feat/committed-label";

// Scenario: a stacked workspace has one committed file and one uncommitted
// file. On the Changes tab, only the committed-only file-row collapsible in
// the main pane should show a "Committed" badge.
it("marks committed-only file collapsibles with a Committed label", async () => {
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

	const workspace = (await getWorkspaces(repoPath)).find(
		(candidate) => candidate.branch_name === BRANCH_NAME,
	);
	if (!workspace) {
		throw new Error(`Expected ${BRANCH_NAME} workspace to exist`);
	}

	await commitWorkspaceFile(
		repoPath,
		{ id: workspace.id, path: workspace.workspace_path },
		"committed-only.txt",
		"already committed content\n",
		"Pre-existing commit",
	);

	writeWorkspaceFile(
		resolveWorkspacePath(repoPath, workspace.workspace_path),
		"uncommitted-only.txt",
		"still dirty\n",
	);

	await user.click(await screen.findByRole("tab", { name: /Changes/ }));
	await screen.findAllByText("uncommitted-only.txt");
	await screen.findAllByText("committed-only.txt");

	const committedRow = await screen.findByTestId(
		"file-row-committed-only.txt",
	);
	expect(
		within(committedRow).getByTestId("committed-file-label"),
	).toHaveTextContent("Committed");

	const uncommittedRow = await screen.findByTestId(
		"file-row-uncommitted-only.txt",
	);
	expect(
		within(uncommittedRow).queryByTestId("committed-file-label"),
	).not.toBeInTheDocument();

	await captureDocument(document, {
		name: "committed-file-label-01-mixed-review",
		expectations: [
			"In the Review main pane, committed-only.txt shows a light blue 'Committed' label next to the copy button in text-sm.",
			"The uncommitted-only.txt file-row header has no 'Committed' label.",
			"The left sidebar lists uncommitted-only.txt under Changes and committed-only.txt under Committed.",
		],
	});
}, 60000);
