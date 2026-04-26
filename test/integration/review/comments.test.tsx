import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	createTestRepo,
	findSidebarBranchElement,
	openRepo,
	resolveWorkspacePath,
	writeWorkspaceFile,
} from "../../utils";
import {
	type Workspace,
	createWorkspace,
	getWorkspaces,
} from "../../../src/lib/api";
import { fireEvent, render, screen, waitFor, within } from "../../test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import userEvent from "@testing-library/user-event";

async function setupWorkspaceWithDiff(
	branchName: string,
	fileContent = "context line 1\nadded line 2\nadded line 3\nadded line 4\ncontext line 5\ncontext line 6\n",
): Promise<{ repoPath: string; workspace: Workspace }> {
	const { repoPath } = createTestRepo(false);
	openRepo(repoPath);

	const workspaceId = await createWorkspace(repoPath, branchName);
	const workspace = (await getWorkspaces(repoPath)).find(
		(w) => w.id === workspaceId,
	);
	if (!workspace) throw new Error("Workspace not found");

	const wsPath = resolveWorkspacePath(repoPath, workspace.workspace_path);
	writeWorkspaceFile(wsPath, "test.txt", fileContent);

	return { repoPath, workspace };
}

async function openReviewTab(
	user: ReturnType<typeof userEvent.setup>,
	branchName: string,
) {
	render(<Dashboard />);
	await user.click(await findSidebarBranchElement(branchName));
	const reviewTab = await screen.findByRole("tab", { name: /^Review/ });
	await user.click(reviewTab);
	await screen.findByRole("tab", { name: /^Review/, selected: true });
}

function getDiffLines() {
	return document.querySelectorAll("[data-diff-line]");
}

function getClickableArea(line: Element) {
	const el = line.querySelector("[data-testid='line-gutter']");
	expect(el).not.toBeNull();
	return el!;
}

async function clickFile(filename: RegExp) {
	const [first] = await screen.findAllByText(filename);
	fireEvent.click(first);
}

async function waitForFileAndLines() {
	await clickFile(/test\.txt/);
	await screen.findByText(/added line 2/);
}

describe("Multi-line selection in diff viewer", () => {
	let user: ReturnType<typeof userEvent.setup>;

	beforeEach(() => {
		user = userEvent.setup();
	});

	it("should highlight lines during forward drag selection", async () => {
		await setupWorkspaceWithDiff("feat/drag-fwd");
		await openReviewTab(user, "feat/drag-fwd");
		await waitForFileAndLines();

		const [, line2, line3, line4] = getDiffLines();

		fireEvent.mouseDown(getClickableArea(line2), { button: 0 });
		fireEvent.mouseEnter(line3);
		fireEvent.mouseEnter(line4);
		fireEvent.mouseUp(line4);

		await waitFor(() => {
			expect(line2.className).toContain("bg-blue-500/10");
			expect(line3.className).toContain("bg-blue-500/10");
			expect(line4.className).toContain("bg-blue-500/10");
		});
	});

	it("should highlight lines during backward drag selection", async () => {
		await setupWorkspaceWithDiff("feat/drag-bwd");
		await openReviewTab(user, "feat/drag-bwd");
		await waitForFileAndLines();

		const [, line2, , line4] = getDiffLines();

		fireEvent.mouseDown(getClickableArea(line4), { button: 0 });
		fireEvent.mouseEnter(line2);
		fireEvent.mouseUp(line2);

		await waitFor(() => {
			expect(line2.className).toContain("bg-blue-500/10");
			expect(line4.className).toContain("bg-blue-500/10");
		});
	});

	it("should keep lines selected after mouseup", async () => {
		await setupWorkspaceWithDiff("feat/drag-persist");
		await openReviewTab(user, "feat/drag-persist");
		await waitForFileAndLines();

		const [, line2, line3, line4] = getDiffLines();

		fireEvent.mouseDown(getClickableArea(line2), { button: 0 });
		fireEvent.mouseEnter(line3);
		fireEvent.mouseEnter(line4);
		fireEvent.mouseUp(getClickableArea(line4));
		fireEvent.click(getClickableArea(line4));

		await waitFor(() => {
			expect(line2.className).toContain("bg-blue-500/10");
			expect(line3.className).toContain("bg-blue-500/10");
			expect(line4.className).toContain("bg-blue-500/10");
		});

		await new Promise((resolve) => setTimeout(resolve, 100));

		expect(line2.className).toContain("bg-blue-500/10");
		expect(line3.className).toContain("bg-blue-500/10");
		expect(line4.className).toContain("bg-blue-500/10");
	});

	it("should open comment input when clicking + after multi-line selection", async () => {
		await setupWorkspaceWithDiff("feat/drag-comment");
		await openReviewTab(user, "feat/drag-comment");
		await waitForFileAndLines();

		const [, line2, , line4] = getDiffLines();

		fireEvent.mouseDown(getClickableArea(line2), { button: 0 });
		fireEvent.mouseEnter(line4);
		fireEvent.mouseUp(line4);

		await waitFor(() => {
			expect(line2.className).toContain("bg-blue-500/10");
		});

		const commentBtn = line4.querySelector("[data-comment-button]")!;
		await user.click(commentBtn as HTMLElement);

		await screen.findByPlaceholderText(/add a comment/i);
	});
});

async function addSingleReviewComment(
	user: ReturnType<typeof userEvent.setup>,
	comment: string,
) {
	await user.click(
		(await screen.findAllByRole("button", { name: /add comment/i }))[0],
	);
	await user.type(
		await screen.findByPlaceholderText(/add a comment/i),
		comment,
	);
	const submit = screen
		.getAllByRole("button", { name: /add comment/i })
		.find((btn) => btn.textContent === "Add Comment");
	expect(submit).toBeTruthy();
	await user.click(submit!);
	await screen.findByText(comment);
}

async function startEditingComment(comment: string) {
	const commentText = await screen.findByText(comment);
	const commentCard = commentText.closest(
		"[data-testid='inline-comment-card']",
	);
	expect(commentCard).toBeTruthy();
	fireEvent.click(commentCard!);
	return screen.findByDisplayValue(comment);
}

describe("Inline comments display", () => {
	let user: ReturnType<typeof userEvent.setup>;

	beforeEach(() => {
		user = userEvent.setup();
	});

	it("should display inline comment on the correct line when line numbers are high", async () => {
		await setupWorkspaceWithDiff(
			"feat/inline-high-lines",
			"context line 1\ncontext line 2\nnew line at 102\ncontext line 3\n",
		);
		await openReviewTab(user, "feat/inline-high-lines");

		await clickFile(/test\.txt/);
		await screen.findAllByRole("button", { name: /add comment/i });

		await addSingleReviewComment(user, "Review comment on line 102");

		await screen.findByText("Review comment on line 102");
	});
});

describe("Inline comment editing", () => {
	let user: ReturnType<typeof userEvent.setup>;

	beforeEach(() => {
		user = userEvent.setup();
	});

	async function setupEditableComment(branchName: string, comment: string) {
		await setupWorkspaceWithDiff(branchName);
		await openReviewTab(user, branchName);
		await clickFile(/test\.txt/);
		await addSingleReviewComment(user, comment);
	}

	it("enters edit mode when clicking an inline comment", async () => {
		await setupEditableComment(
			"feat/comment-edit-open",
			"Original comment text",
		);

		const textarea = await startEditingComment("Original comment text");
		const editForm = textarea.parentElement;
		expect(editForm).toBeTruthy();

		expect(
			within(editForm!).getByRole("button", { name: /^save$/i }),
		).toBeTruthy();
		expect(
			within(editForm!).getByRole("button", { name: /^cancel$/i }),
		).toBeTruthy();
		expect(
			within(editForm!).getByRole("button", { name: /^discard$/i }),
		).toBeTruthy();
	});

	it("updates inline comment text when saving", async () => {
		await setupEditableComment(
			"feat/comment-edit-save",
			"Original comment text",
		);

		const textarea = await startEditingComment("Original comment text");
		await user.clear(textarea);
		await user.type(textarea, "Updated comment text");
		const editForm = textarea.parentElement;
		expect(editForm).toBeTruthy();
		await user.click(
			within(editForm!).getByRole("button", { name: /^save$/i }),
		);

		await screen.findByText("Updated comment text");
		expect(screen.queryByDisplayValue("Updated comment text")).toBeNull();
		expect(screen.queryByText("Original comment text")).toBeNull();
	});

	it("saves an inline comment with Cmd+Enter", async () => {
		await setupEditableComment(
			"feat/comment-edit-shortcut",
			"Original comment text",
		);

		const textarea = await startEditingComment("Original comment text");
		await user.clear(textarea);
		await user.type(textarea, "Keyboard saved text");
		await user.keyboard("{Meta>}{Enter}{/Meta}");

		await screen.findByText("Keyboard saved text");
	});

	it("restores the original inline comment when canceling edit", async () => {
		await setupEditableComment(
			"feat/comment-edit-cancel",
			"Original comment text",
		);

		const textarea = await startEditingComment("Original comment text");
		await user.clear(textarea);
		await user.type(textarea, "Modified but not saved");
		const editForm = textarea.parentElement;
		expect(editForm).toBeTruthy();
		await user.click(
			within(editForm!).getByRole("button", { name: /^cancel$/i }),
		);

		await screen.findByText("Original comment text");
		expect(screen.queryByText("Modified but not saved")).toBeNull();
	});

	it("cancels inline comment editing with Escape", async () => {
		await setupEditableComment(
			"feat/comment-edit-escape",
			"Original comment text",
		);

		const textarea = await startEditingComment("Original comment text");
		await user.clear(textarea);
		await user.type(textarea, "Will be discarded");
		await user.keyboard("{Escape}");

		await screen.findByText("Original comment text");
		expect(screen.queryByDisplayValue("Will be discarded")).toBeNull();
	});

	it("disables saving when the edited inline comment is empty", async () => {
		await setupEditableComment(
			"feat/comment-edit-empty",
			"Original comment text",
		);

		const textarea = await startEditingComment("Original comment text");
		await user.clear(textarea);

		const editForm = textarea.parentElement;
		expect(editForm).toBeTruthy();
		expect(
			within(editForm!).getByRole("button", { name: /^save$/i }),
		).toBeDisabled();
	});

	it("discards the inline comment from edit mode", async () => {
		await setupEditableComment(
			"feat/comment-edit-discard",
			"Original comment text",
		);

		const textarea = await startEditingComment("Original comment text");
		const editForm = textarea.parentElement;
		expect(editForm).toBeTruthy();

		await user.click(
			within(editForm!).getByRole("button", { name: /^discard$/i }),
		);

		await waitFor(() => {
			expect(screen.queryByText("Original comment text")).toBeNull();
		});
	});
});

describe("Copy button in Finish Review popover", () => {
	let user: ReturnType<typeof userEvent.setup>;

	beforeEach(() => {
		user = userEvent.setup();
	});

	async function setupReviewMode(branchName: string) {
		await setupWorkspaceWithDiff(branchName);
		await openReviewTab(user, branchName);

		await clickFile(/test\.txt/);
		await addSingleReviewComment(user, "Test comment");
	}

	function findReviewCopyButton() {
		const copyButtons = screen.getAllByRole("button", { name: /copy/i });
		return copyButtons.find(
			(btn) =>
				btn.textContent?.includes("Copy") && !btn.textContent?.includes("path"),
		)!;
	}

	it("should NOT show copy button in header bar", async () => {
		await setupReviewMode("feat/no-copy-header");

		await waitFor(() => {
			const discardButtons = screen.getAllByRole("button", {
				name: /discard/i,
			});
			const reviewDiscardButton = discardButtons.find(
				(btn) => btn.textContent === "Discard",
			);
			expect(reviewDiscardButton).toBeInTheDocument();
		});

		const copyButtons = screen.queryAllByRole("button", { name: /copy/i });
		const discardButtons = screen.getAllByRole("button", { name: /discard/i });
		const reviewDiscardButton = discardButtons.find(
			(btn) => btn.textContent === "Discard",
		)!;
		const headerContainer = reviewDiscardButton.parentElement;

		const copyButtonsInHeader = copyButtons.filter((btn) =>
			headerContainer?.contains(btn),
		);
		expect(copyButtonsInHeader.length).toBe(0);
	});

	it("should show copy button inside Finish Review popover", async () => {
		await setupReviewMode("feat/copy-in-popover");

		const finishButton = await screen.findByRole("button", {
			name: /finish review/i,
		});
		await user.click(finishButton);

		await waitFor(() => {
			const copyButtons = screen.getAllByRole("button", { name: /copy/i });
			expect(copyButtons.length).toBeGreaterThan(0);
		});
	});

	it("should position copy button on the left side of popover actions", async () => {
		await setupReviewMode("feat/copy-position");

		const finishButton = await screen.findByRole("button", {
			name: /finish review/i,
		});
		await user.click(finishButton);

		await waitFor(() => {
			expect(findReviewCopyButton()).toBeInTheDocument();
		});

		const copyButton = findReviewCopyButton();
		const planButton = screen.getByRole("button", { name: /^plan$/i });
		const editButton = screen.getByRole("button", { name: /^edit$/i });

		const allButtons = screen.getAllByRole("button");
		const copyIndex = allButtons.indexOf(copyButton);
		const planIndex = allButtons.indexOf(planButton);
		const editIndex = allButtons.indexOf(editButton);

		expect(copyIndex).toBeLessThan(planIndex);
		expect(copyIndex).toBeLessThan(editIndex);
	});

	it("should copy review to clipboard when clicked", async () => {
		const clipboardSpy = vi
			.spyOn(navigator.clipboard, "writeText")
			.mockResolvedValue();

		await setupReviewMode("feat/copy-clipboard");

		const finishButton = await screen.findByRole("button", {
			name: /finish review/i,
		});
		await user.click(finishButton);

		await waitFor(() => {
			expect(findReviewCopyButton()).toBeInTheDocument();
		});
		await user.click(findReviewCopyButton());

		await waitFor(() => {
			expect(clipboardSpy).toHaveBeenCalled();
			expect(clipboardSpy.mock.calls[0][0]).toContain("Test comment");
		});

		clipboardSpy.mockRestore();
	});

	it("should show 'Copied' state after copying", async () => {
		vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();

		await setupReviewMode("feat/copied-state");

		const finishButton = await screen.findByRole("button", {
			name: /finish review/i,
		});
		await user.click(finishButton);

		await waitFor(() => {
			expect(findReviewCopyButton()).toBeInTheDocument();
		});
		await user.click(findReviewCopyButton());

		await waitFor(() => {
			const copiedButtons = screen.getAllByRole("button", { name: /copied/i });
			const reviewCopiedButton = copiedButtons.find((btn) =>
				btn.textContent?.includes("Copied"),
			);
			expect(reviewCopiedButton).toBeInTheDocument();
		});
	});

	it("should show close button at top-right of popover", async () => {
		await setupReviewMode("feat/close-btn");

		const finishButton = await screen.findByRole("button", {
			name: /finish review/i,
		});
		await user.click(finishButton);

		await screen.findByRole("button", { name: /^close$/i });
	});

	it("should not show toast when copying review", async () => {
		vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();

		await setupReviewMode("feat/no-toast");

		const finishButton = await screen.findByRole("button", {
			name: /finish review/i,
		});
		await user.click(finishButton);

		await waitFor(() => {
			expect(findReviewCopyButton()).toBeInTheDocument();
		});
		await user.click(findReviewCopyButton());

		expect(screen.queryByText("Copied to clipboard")).not.toBeInTheDocument();
	});
});
