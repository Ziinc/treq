import * as React from "react";
import { beforeEach, describe, expect, it } from "vitest";
import {
	createTestRepo,
	findSidebarBranchElement,
	openRepo,
	resolveWorkspacePath,
	writeWorkspaceFile,
} from "../../utils";
import { createWorkspace, getWorkspaces } from "../../../src/lib/api";
import { render, screen, waitFor, within } from "../../test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import userEvent from "@testing-library/user-event";

async function setupConflict(): Promise<{ stackedBranch: string }> {
	const { repoPath } = createTestRepo(false);
	openRepo(repoPath);

	const baseId = await createWorkspace(repoPath, "feature-base");
	const baseWs = (await getWorkspaces(repoPath)).find((w) => w.id === baseId);
	if (!baseWs) throw new Error("Base workspace not found");
	const basePath = resolveWorkspacePath(repoPath, baseWs.workspace_path);

	const stackedId = await createWorkspace(
		repoPath,
		"feat/stacked",
		"feature-base",
	);
	const stackedWs = (await getWorkspaces(repoPath)).find(
		(w) => w.id === stackedId,
	);
	if (!stackedWs) throw new Error("Stacked workspace not found");
	const stackedPath = resolveWorkspacePath(repoPath, stackedWs.workspace_path);

	writeWorkspaceFile(basePath, "README.md", "base version content");
	writeWorkspaceFile(stackedPath, "README.md", "stacked version content");

	return { stackedBranch: "feat/stacked" };
}

async function navigateToReviewTab(
	user: ReturnType<typeof userEvent.setup>,
	branchName: string,
) {
	await user.click(await findSidebarBranchElement(branchName));
	const reviewTab = await screen.findByRole("tab", { name: /^Review/ });
	await user.click(reviewTab);
	await screen.findByRole("tab", { name: /^Review/, selected: true });
}

async function findFirstAddCommentBtn() {
	return (await screen.findAllByRole("button", { name: /add comment/i }))[0];
}

async function openFirstCommentForm(user: ReturnType<typeof userEvent.setup>) {
	const btn = await findFirstAddCommentBtn();
	await user.click(btn);
	return (await screen.findAllByPlaceholderText("Add a comment..."))[0];
}

async function saveComment(
	user: ReturnType<typeof userEvent.setup>,
	text: string,
) {
	const textarea = await openFirstCommentForm(user);
	await user.type(textarea, text);
	const addBtns = screen.getAllByRole("button", { name: "Add Comment" });
	await user.click(addBtns[0]);
	await waitFor(() =>
		expect(screen.queryAllByPlaceholderText("Add a comment...")).toHaveLength(
			0,
		),
	);
}

function firstNoteContainer() {
	return screen.getAllByText("Resolution note:")[0].parentElement!;
}

describe("Review - Conflict detection and comments", () => {
	let user: ReturnType<typeof userEvent.setup>;

	beforeEach(() => {
		user = userEvent.setup();
	});

	describe("conflict detection", () => {
		it("shows Conflicts section in Review tab with conflicted file", async () => {
			const { stackedBranch } = await setupConflict();
			render(<Dashboard />);
			await navigateToReviewTab(user, stackedBranch);
			await screen.findByText("Conflicts");
			await waitFor(() =>
				expect(screen.getAllByText("README.md").length).toBeGreaterThan(0),
			);
		});
	});

	describe("comment toggle", () => {
		it("opens comment form when clicking Add comment", async () => {
			const { stackedBranch } = await setupConflict();
			render(<Dashboard />);
			await navigateToReviewTab(user, stackedBranch);
			await openFirstCommentForm(user);
			expect(
				screen.getAllByPlaceholderText("Add a comment...").length,
			).toBeGreaterThan(0);
		});

		it("closes comment form when toggling off", async () => {
			const { stackedBranch } = await setupConflict();
			render(<Dashboard />);
			await navigateToReviewTab(user, stackedBranch);
			const btn = await findFirstAddCommentBtn();
			await user.click(btn);
			await screen.findAllByPlaceholderText("Add a comment...");
			await user.click(btn);
			await waitFor(() =>
				expect(
					screen.queryAllByPlaceholderText("Add a comment..."),
				).toHaveLength(0),
			);
		});

		it("auto-focuses textarea when comment form opens", async () => {
			const { stackedBranch } = await setupConflict();
			render(<Dashboard />);
			await navigateToReviewTab(user, stackedBranch);
			const textarea = await openFirstCommentForm(user);
			expect(textarea).toHaveFocus();
		});

		it("closes form and displays comment after saving", async () => {
			const { stackedBranch } = await setupConflict();
			render(<Dashboard />);
			await navigateToReviewTab(user, stackedBranch);
			await saveComment(user, "my resolution note");
			expect(screen.queryAllByPlaceholderText("Add a comment...")).toHaveLength(
				0,
			);
			await waitFor(() =>
				expect(
					screen.getAllByText("my resolution note").length,
				).toBeGreaterThan(0),
			);
		});
	});

	describe("comment editing", () => {
		it("enters edit mode when clicking saved comment", async () => {
			const { stackedBranch } = await setupConflict();
			render(<Dashboard />);
			await navigateToReviewTab(user, stackedBranch);
			await saveComment(user, "original note");
			await screen.clickByText("original note");
			expect(
				screen.getAllByDisplayValue("original note").length,
			).toBeGreaterThan(0);
			expect(
				screen.getAllByRole("button", { name: "Discard" }).length,
			).toBeGreaterThan(0);
			expect(
				screen.getAllByRole("button", { name: "Cancel" }).length,
			).toBeGreaterThan(0);
			expect(
				screen.getAllByRole("button", { name: "Save" }).length,
			).toBeGreaterThan(0);
		});

		it("saves edited comment", async () => {
			const { stackedBranch } = await setupConflict();
			render(<Dashboard />);
			await navigateToReviewTab(user, stackedBranch);
			await saveComment(user, "original note");
			await screen.clickByText("original note");
			const [editTextarea] = screen.getAllByDisplayValue("original note");
			await user.clear(editTextarea);
			await user.type(editTextarea, "updated note");
			await screen.clickByRole("button", { name: "Save" });
			await waitFor(() =>
				expect(screen.getAllByText("updated note").length).toBeGreaterThan(0),
			);
			expect(screen.queryByText("original note")).not.toBeInTheDocument();
		});

		it("cancels edit preserving original text", async () => {
			const { stackedBranch } = await setupConflict();
			render(<Dashboard />);
			await navigateToReviewTab(user, stackedBranch);
			await saveComment(user, "original note");
			await screen.clickByText("original note");
			const [editTextarea] = screen.getAllByDisplayValue("original note");
			await user.clear(editTextarea);
			await user.type(editTextarea, "discarded text");
			await screen.clickByRole("button", { name: "Cancel" });
			await waitFor(() =>
				expect(screen.getAllByText("original note").length).toBeGreaterThan(0),
			);
		});

		it("Escape cancels edit", async () => {
			const { stackedBranch } = await setupConflict();
			render(<Dashboard />);
			await navigateToReviewTab(user, stackedBranch);
			await saveComment(user, "original note");
			await screen.clickByText("original note");
			const [editTextarea] = screen.getAllByDisplayValue("original note");
			await user.clear(editTextarea);
			await user.type(editTextarea, "discarded text");
			await user.keyboard("{Escape}");
			await waitFor(() =>
				expect(screen.getAllByText("original note").length).toBeGreaterThan(0),
			);
		});

		it("Cmd+Enter saves edit", async () => {
			const { stackedBranch } = await setupConflict();
			render(<Dashboard />);
			await navigateToReviewTab(user, stackedBranch);
			await saveComment(user, "original note");
			await screen.clickByText("original note");
			const [editTextarea] = screen.getAllByDisplayValue("original note");
			await user.clear(editTextarea);
			await user.type(editTextarea, "updated via shortcut");
			await user.keyboard("{Meta>}{Enter}{/Meta}");
			await waitFor(() =>
				expect(
					screen.getAllByText("updated via shortcut").length,
				).toBeGreaterThan(0),
			);
		});

		it("deletes comment via Discard in edit mode", async () => {
			const { stackedBranch } = await setupConflict();
			render(<Dashboard />);
			await navigateToReviewTab(user, stackedBranch);
			await saveComment(user, "note to discard");
			await screen.clickByText("note to discard");
			await screen.clickByRole("button", { name: "Discard" });
			await waitFor(() =>
				expect(screen.queryAllByText("note to discard")).toHaveLength(0),
			);
		});

		it("deletes comment via X button in display mode", async () => {
			const { stackedBranch } = await setupConflict();
			render(<Dashboard />);
			await navigateToReviewTab(user, stackedBranch);
			await saveComment(user, "note to delete");
			const noteContainer = firstNoteContainer();
			const deleteBtn = within(noteContainer).getByRole("button");
			await user.click(deleteBtn);
			await waitFor(() =>
				expect(screen.queryAllByText("note to delete")).toHaveLength(0),
			);
		});
	});
});
