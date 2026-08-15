/**
 * Verifies the Undo action on the abandon-commit toast in the Commits tab.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as React from "react";
import { expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { ask } from "@tauri-apps/plugin-dialog";
import {
	commitWorkspaceFile,
	createTestRepo,
	openRepo,
	resolveWorkspacePath,
} from "../../../test/utils";
import { render, screen, waitFor, within } from "../../../test/test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import { getWorkspaces } from "../../../src/lib/api";
import { captureDocument } from "../capture";

const BRANCH_NAME = "feat/abandon-undo";

it("captures Undo on the abandon-commit toast restoring the commit", async () => {
	vi.mocked(ask).mockResolvedValue(true);

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
	if (!workspace) throw new Error(`Expected ${BRANCH_NAME} workspace`);

	await commitWorkspaceFile(
		repoPath,
		{ id: workspace.id, path: workspace.workspace_path },
		"keep.txt",
		"payload",
		"Keep this commit",
	);

	const fileOnDisk = path.join(
		resolveWorkspacePath(repoPath, workspace.workspace_path),
		"keep.txt",
	);

	await user.click(await screen.findByRole("tab", { name: /^Commits/ }));
	const commitButton = await screen.findByRole("button", {
		name: /Keep this commit/i,
	});
	await user.click(commitButton);

	await captureDocument(document, {
		name: "commits-abandon-undo-01-before-abandon",
		expectations: [
			'The Commits tab shows "Keep this commit" expanded with a "Delete commit" button.',
			"No discard or restore toast is visible.",
		],
	});

	await user.click(
		await screen.findByRole("button", { name: /delete commit/i }),
	);
	const toast = await screen.findByText(/Abandoned commit/i);
	expect(fs.existsSync(fileOnDisk)).toBe(false);

	const undoButton = within(toast.closest('[role="status"]')!).getByRole(
		"button",
		{ name: /^undo$/i },
	);
	await captureDocument(document, {
		name: "commits-abandon-undo-02-toast-with-undo",
		expectations: [
			'A toast titled "Commit deleted" is visible with an underlined "Undo" action.',
			'"Keep this commit" is no longer listed as an active workspace commit, or is animating out.',
		],
	});

	await user.click(undoButton);
	await screen.findByText("Restored");
	expect(fs.existsSync(fileOnDisk)).toBe(true);
	await waitFor(() =>
		expect(
			screen.getAllByText(/Keep this commit/i).length,
		).toBeGreaterThan(0),
	);

	await captureDocument(document, {
		name: "commits-abandon-undo-03-after-undo",
		expectations: [
			'A "Restored" toast is visible.',
			'"Keep this commit" is listed again in the Commits tab.',
		],
	});
}, 60000);
