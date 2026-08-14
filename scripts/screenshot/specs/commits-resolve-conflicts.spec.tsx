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

it("captures Resolve conflicts banner on the Commits tab", async () => {
	const { repoPath, defaultBranch } = createTestRepo(false);
	openRepo(repoPath);

	const user = userEvent.setup();
	const workspaceId = await createWorkspace(
		repoPath,
		"feat/commits-resolve",
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
	await user.click(await findSidebarBranchElement("feat/commits-resolve"));
	await screen.findByTestId(`workspace-conflict-indicator-${workspaceId}`);

	const commitsTab = await screen.findByRole("tab", { name: /commits/i });
	await user.click(commitsTab);

	await screen.findByTestId("resolve-conflicts-banner");
	await screen.findByTestId("resolve-conflicts-button");

	await captureDocument(document, {
		name: "commits-resolve-conflicts-01-banner",
		expectations: [
			'The Commits tab shows a red banner reading "1 conflicted commit".',
			'A "Resolve conflicts…" button is visible on the right of the banner.',
			"A Conflict badge is visible on the conflicted commit row (when expanded or in the list metadata).",
		],
	});

	await user.click(screen.getByTestId("resolve-conflicts-button"));
	await screen.findByTestId("resolve-conflicts-prompt");
	// Resolve workspaces are prepared when the dialog opens (path listed + copy).
	await screen.findAllByText(/\.treq\/resolve\//i, {}, { timeout: 15000 });

	await captureDocument(document, {
		name: "commits-resolve-conflicts-02-dialog",
		expectations: [
			'A dialog titled "Resolve conflicts…" is open with a prompt textarea.',
			"Copy mentions .treq/resolve/<workspace>/<change-id>/ sandboxes.",
			"Prepared resolve directory paths under .treq/resolve are listed.",
		],
	});
});
