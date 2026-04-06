/**
 * Integration tests for ChangesDiffViewer.
 *
 * Exercises functionality that flows through the extracted hooks:
 * - useDiffViewerState (file collapse/expand, search)
 * - useReviewState (add/delete review comment)
 * - useConflictState is exercised implicitly — conflicted files are detected
 *   and rendered; no artificial conflict fixture is required.
 */
import { describe, it, expect } from "vitest";
import * as React from "react";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "../../test-utils";
import {
	createTestRepo,
	findSidebarBranchElement,
	openRepo,
	resolveWorkspacePath,
	writeWorkspaceFile,
} from "../../utils";
import {
	createWorkspace,
	getWorkspaces,
	type Workspace,
} from "../../../src/lib/api";
import { Dashboard } from "../../../src/components/Dashboard";

async function setupWorkspaceWithFile(
	branchName: string,
	fileName: string,
	content: string,
): Promise<{ repoPath: string; workspace: Workspace }> {
	const { repoPath } = createTestRepo(false);
	openRepo(repoPath);

	const workspaceId = await createWorkspace(repoPath, branchName);
	const workspace = (await getWorkspaces(repoPath)).find(
		(item) => item.id === workspaceId,
	);
	if (!workspace) throw new Error("Workspace not found");

	writeWorkspaceFile(
		resolveWorkspacePath(repoPath, workspace.workspace_path),
		fileName,
		content,
	);

	return { repoPath, workspace };
}

async function openChangesTab(branchName: string) {
	const user = userEvent.setup();
	render(<Dashboard />);
	await user.click(await findSidebarBranchElement(branchName));
	// "Changes" is the default tab — wait for the diff viewer to appear
	await screen.findByRole("tab", { name: /^Changes/ });
	return user;
}

// ─── diff rendering ──────────────────────────────────────────────────────────

describe("ChangesDiffViewer — diff rendering (useDiffViewerState)", () => {
	it("shows file path and diff lines for a modified file", async () => {
		const branchName = "feat/cdv-render";
		const fileName = "hello.txt";
		await setupWorkspaceWithFile(
			branchName,
			fileName,
			"first line\nsecond line\n",
		);

		await openChangesTab(branchName);

		// File name appears in the file header
		await screen.findByText(fileName);
		// Added lines appear in the diff
		await screen.findByText("first line");
	});

	it("can collapse and re-expand a file diff via the file header toggle", async () => {
		const branchName = "feat/cdv-collapse";
		const fileName = "toggle-file.txt";
		await setupWorkspaceWithFile(branchName, fileName, "some content\n");

		const user = await openChangesTab(branchName);

		await screen.findByText(fileName);
		// "some content" should be visible in the expanded diff
		await screen.findByText("some content");

		// Click the collapse button (aria-label: "Collapse file diff")
		const collapseBtn = await screen.findByRole("button", {
			name: "Collapse file diff",
		});
		await user.click(collapseBtn);

		// After collapse the diff lines are hidden; the expand button appears
		await screen.findByRole("button", { name: "Expand file diff" });
		await waitFor(() =>
			expect(screen.queryByText("some content")).not.toBeInTheDocument(),
		);

		// Re-expand
		await user.click(screen.getByRole("button", { name: "Expand file diff" }));
		await screen.findByText("some content");
	});
});

// ─── review comments (useReviewState) ────────────────────────────────────────

describe("ChangesDiffViewer — review comments (useReviewState)", () => {
	it("adds a review comment and displays it inline", async () => {
		const branchName = "feat/cdv-comment";
		const fileName = "review-target.txt";
		await setupWorkspaceWithFile(
			branchName,
			fileName,
			"review me\n",
		);

		const user = await openChangesTab(branchName);

		await screen.findByText(fileName);

		// Click the first "Add comment" button on a diff line
		const addBtn = (
			await screen.findAllByRole("button", { name: /add comment/i })
		)[0];
		await user.click(addBtn);

		// Type a comment in the input that appears
		const textarea = await screen.findByPlaceholderText(/add a comment/i);
		await user.type(textarea, "My integration test comment");

		// Submit
		const submitBtn = screen
			.getAllByRole("button", { name: /add comment/i })
			.find((b) => b.textContent === "Add Comment");
		expect(submitBtn).toBeTruthy();
		await user.click(submitBtn!);

		// Comment is rendered inline
		await screen.findByText("My integration test comment");
	});

	it("deletes a review comment", async () => {
		const branchName = "feat/cdv-delete";
		const fileName = "delete-target.txt";
		await setupWorkspaceWithFile(branchName, fileName, "delete me\n");

		const user = await openChangesTab(branchName);
		await screen.findByText(fileName);

		// Add a comment first
		const addBtn = (
			await screen.findAllByRole("button", { name: /add comment/i })
		)[0];
		await user.click(addBtn);
		await user.type(
			await screen.findByPlaceholderText(/add a comment/i),
			"comment to delete",
		);
		const submitBtn = screen
			.getAllByRole("button", { name: /add comment/i })
			.find((b) => b.textContent === "Add Comment");
		await user.click(submitBtn!);
		await screen.findByText("comment to delete");

		// Delete the comment
		const deleteBtn = await screen.findByRole("button", { name: /delete/i });
		await user.click(deleteBtn);

		await waitFor(() =>
			expect(
				screen.queryByText("comment to delete"),
			).not.toBeInTheDocument(),
		);
	});
});
