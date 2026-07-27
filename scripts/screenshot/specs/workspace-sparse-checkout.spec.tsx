import * as React from "react";
import fs from "fs";
import path from "path";
import { expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import {
	createTestRepo,
	gitCommitRepoFile,
	openRepo,
	resolveWorkspacePath,
} from "../../../test/utils";
import { render, screen, waitFor, within } from "../../../test/test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import { getWorkspaces } from "../../../src/lib/api";
import { captureDocument } from "../capture";

const BRANCH_NAME = "feat/sparse-demo";

// Scenario: the repo has files under src/ and docs/. The user creates a
// workspace via the home repo's "Stack" button and fills the new "Sparse
// paths" field with "src", so the created workspace materializes only the
// src/ subtree. Captures the dialog empty, the dialog filled, and the
// workspace view after creation.
it("captures creating a workspace with sparse checkout paths", async () => {
	const { repoPath } = createTestRepo(false);
	openRepo(repoPath);

	// Branch-advancing git commits so the new workspace sees these files.
	await gitCommitRepoFile(
		repoPath,
		"src/lib.ts",
		"export const lib = true;",
		"add src/lib.ts",
	);
	await gitCommitRepoFile(repoPath, "docs/guide.md", "# Guide", "add docs");

	const user = userEvent.setup();
	render(<Dashboard />);

	await screen.findByTestId("show-workspace-header");
	await user.click(await screen.findByRole("button", { name: "Stack" }));

	const dialog = await screen.findByTestId("modal");
	await within(dialog).findByLabelText("Sparse paths (optional, one per line)");
	await captureDocument(document, {
		name: "workspace-sparse-checkout-01-dialog-empty",
		expectations: [
			"The workspace creation dialog is open over the dashboard.",
			'A "Sparse paths (optional, one per line)" labeled textarea is visible between the Description field and the Branch Name field.',
		],
	});

	await user.type(
		within(dialog).getByLabelText("Branch Name"),
		BRANCH_NAME,
	);
	await user.type(
		within(dialog).getByLabelText("Sparse paths (optional, one per line)"),
		"src",
	);
	await captureDocument(document, {
		name: "workspace-sparse-checkout-02-dialog-filled",
		expectations: [
			`The Branch Name input contains "${BRANCH_NAME}".`,
			'The sparse paths textarea contains "src".',
		],
	});

	await user.click(
		within(dialog).getByRole("button", { name: "Create Workspace" }),
	);
	await waitFor(() => {
		expect(screen.queryByTestId("modal")).not.toBeInTheDocument();
	});

	const header = await screen.findByTestId("show-workspace-header");
	await within(header).findByText(BRANCH_NAME);

	// The workspace record carries the patterns and only src/ is on disk.
	const workspace = (await getWorkspaces(repoPath)).find(
		(candidate) => candidate.branch_name === BRANCH_NAME,
	);
	if (!workspace) {
		throw new Error(`Expected ${BRANCH_NAME} workspace to exist`);
	}
	expect(workspace.sparse_patterns).toEqual(["src"]);
	const workspacePath = resolveWorkspacePath(
		repoPath,
		workspace.workspace_path,
	);
	expect(fs.existsSync(path.join(workspacePath, "src/lib.ts"))).toBe(true);
	expect(fs.existsSync(path.join(workspacePath, "docs"))).toBe(false);

	await captureDocument(document, {
		name: "workspace-sparse-checkout-03-workspace-created",
		expectations: [
			`The workspace header shows the ${BRANCH_NAME} branch, meaning the sparse workspace was created and opened.`,
			"No error toast or dialog is visible.",
		],
	});
}, 60000);
