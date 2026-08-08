import * as React from "react";
import { it } from "vitest";
import userEvent from "@testing-library/user-event";
import {
	createTestRepo,
	findSidebarBranchElement,
	openRepo,
	resolveWorkspacePath,
	writeWorkspaceFile,
} from "../../../test/utils";
import { render, screen, within } from "../../../test/test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import {
	checkAndRebaseWorkspaces,
	createCommit,
	createWorkspace,
	ensureWorkspaceIndexed,
	getWorkspaces,
} from "../../../src/lib/api";
import { captureDocument } from "../capture";

// Rebase conflicts land in committed hunks. Hiding the Committed section must
// still leave the Conflicts list and inline conflict card visible.
it("captures committed-tip conflict after hiding Committed changes", async () => {
	const { repoPath, defaultBranch } = createTestRepo(false);
	openRepo(repoPath);

	const user = userEvent.setup();

	const workspaceId = await createWorkspace(
		repoPath,
		"feat/committed-conflict-hidden",
	);
	const workspace = (await getWorkspaces(repoPath)).find(
		(w) => w.id === workspaceId,
	);
	if (!workspace) throw new Error("Workspace not found");
	const workspacePath = resolveWorkspacePath(
		repoPath,
		workspace.workspace_path,
	);

	writeWorkspaceFile(workspacePath, "README.md", "workspace side\n");
	await createCommit(repoPath, workspaceId, "workspace conflicting change");

	writeWorkspaceFile(repoPath, "README.md", "main side\n");
	await createCommit(repoPath, null, "main conflicting change");

	await checkAndRebaseWorkspaces(repoPath, workspaceId, defaultBranch, true);
	await ensureWorkspaceIndexed(repoPath, workspaceId, workspacePath);

	render(<Dashboard />);
	await screen.findByTestId(`workspace-conflict-indicator-${workspaceId}`);

	await user.click(
		await findSidebarBranchElement("feat/committed-conflict-hidden"),
	);
	const reviewTab = await screen.findByRole("tab", { name: /^Review/ });
	await user.click(reviewTab);
	await screen.findByRole("tab", { name: /^Review/, selected: true });
	await screen.findByText("Conflicts");

	await captureDocument(document, {
		name: "review-committed-conflict-hidden-01-before-toggle",
		expectations: [
			'The Review sidebar shows a red "Conflicts" section listing README.md while Committed changes are still visible.',
			"The workspace conflict indicator is present for the selected feature branch.",
		],
	});

	await user.click(await screen.findByRole("button", { name: /Committed/ }));

	const conflictsToggle = await screen.findByRole("button", {
		name: "Conflicts",
	});
	const conflictsSection = conflictsToggle.closest("div")?.parentElement;
	if (!conflictsSection) throw new Error("Conflicts section not found");
	await user.click(await within(conflictsSection).findByTitle("README.md"));
	await screen.findByText(/^Conflict 1 of 1$/);

	await captureDocument(document, {
		name: "review-committed-conflict-hidden-02-after-hide-committed",
		expectations: [
			'After hiding Committed, the Conflicts section still lists README.md and the diff shows "Conflict 1 of 1".',
			'Conflict side badges "Side #1", "Base", and "Side #2" remain visible on the card.',
			'The main pane does not show an empty "No changes to review" state.',
		],
	});
}, 60000);
