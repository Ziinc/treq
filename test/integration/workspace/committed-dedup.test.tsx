import * as React from "react";
import { beforeEach, describe, expect, it } from "vitest";
import {
	createTestRepo,
	findSidebarBranchElement,
	openRepo,
	resolveWorkspacePath,
	writeWorkspaceFile,
} from "../../utils";
import {
	createCommit,
	createWorkspace,
	getWorkspaces,
} from "../../../src/lib/api";
import { render, screen, waitFor } from "../../test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import userEvent from "@testing-library/user-event";

async function setupOverlappingWorkspace(branchName: string) {
	const { repoPath } = createTestRepo(false);
	openRepo(repoPath);

	const workspaceId = await createWorkspace(repoPath, branchName);
	const workspace = (await getWorkspaces(repoPath)).find(
		(item) => item.id === workspaceId,
	);
	if (!workspace) throw new Error(`Workspace not found for id ${workspaceId}`);

	const workspacePath = resolveWorkspacePath(
		repoPath,
		workspace.workspace_path,
	);

	writeWorkspaceFile(workspacePath, "shared.txt", "shared v1\n");
	await createCommit(repoPath, workspaceId, "commit shared file");

	writeWorkspaceFile(workspacePath, "shared.txt", "shared v2\n");
	writeWorkspaceFile(workspacePath, "committed-only.txt", "committed only\n");
	await createCommit(repoPath, workspaceId, "commit committed-only file");

	writeWorkspaceFile(workspacePath, "shared.txt", "shared v3\n");

	return {
		branchName,
		repoPath,
		workspaceId,
	};
}

describe("ShowWorkspace - committed diff dedupe integration", () => {
	let user: ReturnType<typeof userEvent.setup>;

	function getCommittedToggleButton() {
		const committedButton = screen
			.getAllByRole("button", { name: /committed/i })
			.find((button) => button.hasAttribute("data-state"));
		if (!committedButton) {
			throw new Error("Committed toggle button not found");
		}
		return committedButton;
	}

	beforeEach(() => {
		user = userEvent.setup();
	});

	it("shows overlapping files in Changes only and preserves committed visibility toggles", async () => {
		const fixture = await setupOverlappingWorkspace("feat/committed-dedupe");

		render(<Dashboard />);
		await user.click(await findSidebarBranchElement(fixture.branchName));

		const reviewTab = await screen.findByRole("tab", { name: /^Review/ });
		await user.click(reviewTab);
		await screen.findByRole("tab", { name: /^Review/, selected: true });

		await waitFor(() => {
			expect(screen.getAllByTitle("shared.txt").length).toBe(1);
			expect(screen.getByTitle("committed-only.txt")).toBeInTheDocument();
		});

		const committedButton = getCommittedToggleButton();
		await user.click(committedButton);
		await waitFor(() => {
			expect(screen.queryByTitle("committed-only.txt")).not.toBeInTheDocument();
		});
	});
});
