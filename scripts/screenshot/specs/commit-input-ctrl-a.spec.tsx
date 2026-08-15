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

const BRANCH_NAME = "feat/commit-input-ctrl-a";

// Ctrl+A pressed while focused in the commit message textarea used to be
// hijacked by the global "select all changed files" shortcut
// (useFileStaging.ts), highlighting every row in the Changes list instead of
// selecting the typed text. CommitInput now stops propagation for standard
// text-editing shortcuts (a/c/x/v/z/y) so the browser's native textarea
// select-all wins and the file list selection is left untouched.
it("captures Ctrl+A in the commit message textarea leaving the file list unselected", async () => {
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

	writeWorkspaceFile(workspacePath, "alpha.txt", "alpha content\n");
	writeWorkspaceFile(workspacePath, "beta.txt", "beta content\n");
	writeWorkspaceFile(workspacePath, "gamma.txt", "gamma content\n");

	await user.click(await screen.findByRole("tab", { name: /^Changes/ }));
	await screen.findByRole("tab", { name: /^Changes/, selected: true });
	await waitFor(() =>
		expect(screen.getAllByText("alpha.txt").length).toBeGreaterThan(0),
	);
	await waitFor(() =>
		expect(screen.getAllByText("beta.txt").length).toBeGreaterThan(0),
	);
	await waitFor(() =>
		expect(screen.getAllByText("gamma.txt").length).toBeGreaterThan(0),
	);

	const textarea = await screen.findByPlaceholderText("Message");
	await user.type(textarea, "A change worth committing");

	await captureDocument(document, {
		name: "commit-input-ctrl-a-01-before",
		expectations: [
			"The commit textarea contains the typed text 'A change worth committing'.",
			"The Changes section lists alpha.txt, beta.txt, and gamma.txt with no row highlighted blue (none selected).",
		],
	});

	// This is the regression: Ctrl+A while focused in the commit textarea
	// must select the textarea's text natively, not trigger the app's
	// global "select all files" shortcut.
	await user.keyboard("{Control>}a{/Control}");

	await captureDocument(document, {
		name: "commit-input-ctrl-a-02-after",
		expectations: [
			"The commit textarea still shows the same typed message (unchanged).",
			"The Changes section still lists alpha.txt, beta.txt, and gamma.txt with none of the rows highlighted blue/selected -- Ctrl+A did not select all files.",
		],
	});
}, 60000);
