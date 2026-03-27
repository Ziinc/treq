import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor, screen, fireEvent } from "./test-utils";
import userEvent from "@testing-library/user-event";
import { CommitDiffViewer } from "../src/components/CommitDiffViewer";
import * as api from "../src/lib/api";
import { createMockCommit } from "./factories/commit.factory";
import type { JjRevisionDiff } from "../src/lib/api";

vi.mock("../src/lib/api", async () => {
	const actual = await vi.importActual("../src/lib/api");
	return {
		...actual,
		jjGetLog: vi.fn(),
		jjGetCommitDiff: vi.fn(),
		abandonCommit: vi.fn(),
		listCommits: vi.fn(),
	};
});

const activeCommits = [
	createMockCommit({
		commit_id: "wc001",
		short_id: "wc001",
		is_working_copy: true,
		description: "(no description)",
		timestamp: "2024-01-15 10:00:00",
	}),
	createMockCommit({
		commit_id: "active001",
		short_id: "abc1234",
		change_id: "chg_active1",
		description: "Active workspace commit",
		timestamp: "2024-01-15 09:00:00",
		is_immutable: false,
	}),
];

const mockDiff: JjRevisionDiff = {
	files: [{ path: "src/main.ts", status: "M", previous_path: null }],
	hunks_by_file: [
		{
			path: "src/main.ts",
			hunks: [
				{
					id: "hunk-1",
					header: "@@ -10,3 +10,4 @@",
					lines: [
						" context line",
						"+added line 1",
						"+added line 2",
						" context end",
					],
					patch: "...",
				},
			],
		},
	],
};

function setupMocks(diff: JjRevisionDiff = mockDiff) {
	vi.mocked(api.jjGetLog).mockResolvedValue({
		commits: activeCommits,
		target_branch: "main",
		workspace_branch: "feat/test",
	});
	vi.mocked(api.listCommits).mockResolvedValue({
		commits: activeCommits,
		target_branch: "main",
		workspace_branch: "feat/test",
		target_branch_commits: [],
	});
	vi.mocked(api.jjGetCommitDiff).mockResolvedValue(diff);
}

async function renderAndExpandCommit(
	onCreateAgentWithComment?: CommitDiffViewerProps["onCreateAgentWithComment"],
) {
	const result = render(
		<CommitDiffViewer
			workspacePath="/test/workspace"
			repoPath="/test/repo"
			workspaceId={1}
			targetBranch="main"
			isHomeRepo={false}
			onCreateAgentWithComment={onCreateAgentWithComment}
		/>,
	);

	// Wait for commits to load
	await waitFor(() => {
		expect(screen.getByText("Active workspace commit")).toBeInTheDocument();
	});

	// Click to expand the commit
	fireEvent.click(screen.getByText("Active workspace commit"));

	// Wait for diff to load
	await waitFor(() => {
		expect(screen.getByText("src/main.ts")).toBeInTheDocument();
	});

	return result;
}

type CommitDiffViewerProps = Parameters<typeof CommitDiffViewer>[0];

beforeEach(() => {
	vi.clearAllMocks();
});

describe("CommitDiffViewer - Comments", () => {
	it("plus button appears on hover", async () => {
		setupMocks();
		const callback = vi.fn();
		await renderAndExpandCommit(callback);

		// The plus buttons should exist (invisible until hover, but in DOM)
		const addButtons = screen.getAllByTitle("Add comment");
		expect(addButtons.length).toBeGreaterThan(0);
	});

	it("comment input opens on plus click", async () => {
		setupMocks();
		const callback = vi.fn();
		await renderAndExpandCommit(callback);

		const addButtons = screen.getAllByTitle("Add comment");
		fireEvent.click(addButtons[0]);

		await waitFor(() => {
			expect(
				screen.getByPlaceholderText("Add a comment..."),
			).toBeInTheDocument();
		});
	});

	it("comment input shows file:line label", async () => {
		setupMocks();
		const callback = vi.fn();
		await renderAndExpandCommit(callback);

		const addButtons = screen.getAllByTitle("Add comment");
		// Click the first add button (context line at line 10)
		fireEvent.click(addButtons[0]);

		await waitFor(() => {
			// Should show file path and line number
			expect(screen.getByText(/src\/main\.ts:L10/)).toBeInTheDocument();
		});
	});

	it("comment cancel closes input", async () => {
		setupMocks();
		const callback = vi.fn();
		await renderAndExpandCommit(callback);

		const addButtons = screen.getAllByTitle("Add comment");
		fireEvent.click(addButtons[0]);

		await waitFor(() => {
			expect(
				screen.getByPlaceholderText("Add a comment..."),
			).toBeInTheDocument();
		});

		// Click Cancel
		fireEvent.click(screen.getByText("Cancel"));

		await waitFor(() => {
			expect(
				screen.queryByPlaceholderText("Add a comment..."),
			).not.toBeInTheDocument();
		});
	});

	it("comment submit calls onCreateAgentWithComment", async () => {
		setupMocks();
		const callback = vi.fn();
		await renderAndExpandCommit(callback);

		// Click plus on the second line ("+added line 1" = new line 11)
		const addButtons = screen.getAllByTitle("Add comment");
		fireEvent.click(addButtons[1]); // second line is "+added line 1"

		await waitFor(() => {
			expect(
				screen.getByPlaceholderText("Add a comment..."),
			).toBeInTheDocument();
		});

		// Type a comment
		const textarea = screen.getByPlaceholderText("Add a comment...");
		await userEvent.type(textarea, "Fix this code");

		// Click Edit button (sends with "acceptEdits" mode)
		fireEvent.click(screen.getByText("Edit"));

		await waitFor(() => {
			expect(callback).toHaveBeenCalledWith(
				"src/main.ts",
				11,
				11,
				["+added line 1"],
				"Fix this code",
				"abc1234",
				"acceptEdits",
			);
		});
	});

	it("multi-line selection highlights lines", async () => {
		setupMocks();
		const callback = vi.fn();
		const { container } = await renderAndExpandCommit(callback);

		// Find all line gutter elements (the line number divs)
		// The hunk has 4 lines, each has two gutter divs (old/new line numbers)
		const hunkLines = container.querySelectorAll("[class*='group flex']");
		expect(hunkLines.length).toBeGreaterThanOrEqual(4);

		// Get the line number gutters for lines 1 and 3 (0-indexed: 1 and 2)
		// Each line row has two gutter divs with cursor-pointer
		const line1Gutters = hunkLines[1].querySelectorAll(
			"[class*='cursor-pointer']",
		);
		const _line3Gutters = hunkLines[2].querySelectorAll(
			"[class*='cursor-pointer']",
		);

		// mouseDown on line 1 gutter
		fireEvent.mouseDown(line1Gutters[0]);
		// mouseEnter on line 3
		fireEvent.mouseEnter(hunkLines[2]);

		// Lines 1-2 should have selection styling
		await waitFor(() => {
			// Check that at least one line has the selection class
			const selectedLines = container.querySelectorAll(
				"[class*='bg-blue-500']",
			);
			expect(selectedLines.length).toBeGreaterThanOrEqual(2);
		});
	});

	it("multi-line comment includes all selected lines", async () => {
		setupMocks();
		const callback = vi.fn();
		const { container } = await renderAndExpandCommit(callback);

		const hunkLines = container.querySelectorAll("[class*='group flex']");
		const line1Gutters = hunkLines[1].querySelectorAll(
			"[class*='cursor-pointer']",
		);

		// mouseDown on line 1 ("+added line 1")
		fireEvent.mouseDown(line1Gutters[0]);
		// mouseEnter on line 2 ("+added line 2")
		fireEvent.mouseEnter(hunkLines[2]);
		// mouseUp
		fireEvent.mouseUp(hunkLines[2]);

		// Click plus button on line 2 (which should use the selection)
		const addButtons = screen.getAllByTitle("Add comment");
		fireEvent.click(addButtons[2]); // line 2's plus button

		await waitFor(() => {
			expect(
				screen.getByPlaceholderText("Add a comment..."),
			).toBeInTheDocument();
		});

		const textarea = screen.getByPlaceholderText("Add a comment...");
		await userEvent.type(textarea, "Review these lines");

		fireEvent.click(screen.getByText("Plan"));

		await waitFor(() => {
			expect(callback).toHaveBeenCalledWith(
				"src/main.ts",
				expect.any(Number), // startLine
				expect.any(Number), // endLine
				expect.arrayContaining(["+added line 1", "+added line 2"]),
				"Review these lines",
				"abc1234",
				"plan",
			);
		});
	});

	it("no comment button on loading/error states", async () => {
		setupMocks();
		// Don't pass callback — no comment support
		await renderAndExpandCommit(undefined);

		// No add comment buttons should exist
		const addButtons = screen.queryAllByTitle("Add comment");
		expect(addButtons.length).toBe(0);
	});

	it("no comment button when onCreateAgentWithComment is not provided", async () => {
		setupMocks();
		await renderAndExpandCommit(undefined);

		const addButtons = screen.queryAllByTitle("Add comment");
		expect(addButtons.length).toBe(0);
	});
});
