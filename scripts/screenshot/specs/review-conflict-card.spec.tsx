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

// The inline conflict card only appears once the backend's conflict regions
// survive the trip to the frontend. This drives the real flow -- treq's own
// auto-rebase onto a diverged default branch, open the Review tab, pick the
// conflicted file -- so the card is rendered from real jj conflict markers.
it("captures the inline conflict card in the Review tab", async () => {
	const { repoPath, defaultBranch } = createTestRepo(false);
	openRepo(repoPath);

	const user = userEvent.setup();

	// Incidental background state: the workspace itself isn't what's being
	// verified, the conflict card inside its Review tab is.
	const workspaceId = await createWorkspace(repoPath, "feat/conflict-card");
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

	await user.click(await findSidebarBranchElement("feat/conflict-card"));
	const reviewTab = await screen.findByRole("tab", { name: /^Review/ });
	await user.click(reviewTab);
	await screen.findByRole("tab", { name: /^Review/, selected: true });

	const conflictsToggle = await screen.findByRole("button", {
		name: "Conflicts",
	});
	const conflictsSection = conflictsToggle.closest("div")?.parentElement;
	if (!conflictsSection) throw new Error("Conflicts section not found");
	await user.click(await within(conflictsSection).findByTitle("README.md"));

	await screen.findByText(/^Conflict 1 of 1$/);
	await captureDocument(document, {
		name: "review-conflict-card-01-inline-card",
		expectations: [
			'The sidebar has a red "Conflicts" section listing README.md.',
			'The diff area shows a conflict card headed "Conflict 1 of 1" with a line range next to it.',
			'Three coloured badges label the conflict sections: "Side #1" (red), "Base" (amber/yellow) and "Side #2" (green), each sitting on its conflict marker line.',
			'The conflicting content lines are visible and tinted by side: "main side" red, "# Test Repository" amber, "workspace side" green.',
			'An "Add comment" button is visible on the conflict card.',
		],
	});
}, 60000);
