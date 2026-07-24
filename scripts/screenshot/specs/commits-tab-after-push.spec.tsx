import * as React from "react";
import { expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import {
	commitRepoFile,
	commitWorkspaceFile,
	createTestRepo,
	findSidebarBranchElement,
	openRepo,
} from "../../../test/utils";
import { render, screen, waitFor } from "../../../test/test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import { createWorkspace, getWorkspaces } from "../../../src/lib/api";
import { captureDocument } from "../capture";

// Scenario: 5 commits land on the default branch, the user creates a
// workspace, makes 2 workspace commits, then pushes that workspace to the
// remote. Captures the Commits tab right before and right after the push so
// the "Push to remote" affordance disappearing is visible in the diff.
it("captures the Commits tab before and after pushing a workspace to remote", async () => {
	const { repoPath } = createTestRepo(true); // withRemote: real bare remote to push against
	openRepo(repoPath);

	for (let i = 1; i <= 5; i++) {
		await commitRepoFile(
			repoPath,
			`repo-file-${i}.txt`,
			`repo commit content ${i}`,
			`Repo commit ${i}`,
		);
	}

	await createWorkspace(repoPath, "feat/commits-tab-demo");
	const workspace = (await getWorkspaces(repoPath)).find(
		(candidate) => candidate.branch_name === "feat/commits-tab-demo",
	);
	if (!workspace) {
		throw new Error("Expected feat/commits-tab-demo workspace to exist");
	}

	await commitWorkspaceFile(
		repoPath,
		{ id: workspace.id, path: workspace.workspace_path },
		"workspace-file-1.txt",
		"workspace commit content 1",
		"Workspace commit 1",
	);
	await commitWorkspaceFile(
		repoPath,
		{ id: workspace.id, path: workspace.workspace_path },
		"workspace-file-2.txt",
		"workspace commit content 2",
		"Workspace commit 2",
	);

	const user = userEvent.setup();
	render(<Dashboard />);

	await user.click(await findSidebarBranchElement("feat/commits-tab-demo"));
	await user.click(await screen.findByRole("tab", { name: "Commits" }));

	await screen.findByText("Workspace commit 2");
	await screen.findByText("Workspace commit 1");
	const pushButton = await screen.findByRole("button", {
		name: /push to remote/i,
	});
	await captureDocument(document, {
		name: "commits-tab-after-push-01-before-push",
	});

	await user.click(pushButton);
	await screen.findByText("Pushed to remote");

	// Known staleness bug: Dashboard's `selectedWorkspace` is a useState
	// snapshot that isn't re-synced when the `workspaces` query refetches
	// after a push, so the "Push to remote" button doesn't disappear on its
	// own even though not_on_remote flipped to false server-side. Re-selecting
	// the workspace from the sidebar (a real, ordinary user action) picks up
	// the fresh object and reveals the correct post-push UI. See the app-qa
	// run notes for the underlying fix.
	await user.click(await findSidebarBranchElement("feat/commits-tab-demo"));
	await user.click(await screen.findByRole("tab", { name: "Commits" }));
	await waitFor(
		() => {
			expect(
				screen.queryByRole("button", { name: /push to remote/i }),
			).not.toBeInTheDocument();
		},
		{ timeout: 15000 },
	);
	// Let the post-push status/toast settle before snapshotting.
	await new Promise((resolve) => setTimeout(resolve, 500));

	await captureDocument(document, {
		name: "commits-tab-after-push-02-after-push",
	});
}, 60000);
