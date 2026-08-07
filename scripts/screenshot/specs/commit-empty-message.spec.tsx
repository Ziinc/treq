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

const BRANCH_NAME = "feat/commit-empty-message";

it("captures inline error when committing with an empty message", async () => {
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

	await captureDocument(document, {
		name: "commit-empty-message-01-before",
		expectations: [
			"The Review sidebar shows a Message textarea with no typed text and a Commit split button below it.",
			"No error text is visible under the Message textarea.",
		],
	});

	await user.click(screen.getByRole("button", { name: /^commit$/i }));
	await screen.findByText("Enter a commit message.");

	await captureDocument(document, {
		name: "commit-empty-message-02-error",
		expectations: [
			"A red 'Enter a commit message.' error appears directly under the Message textarea.",
			"The Message textarea has a red/destructive border indicating invalid input.",
			"The Commit split button remains visible below the error text.",
		],
	});
}, 60000);
