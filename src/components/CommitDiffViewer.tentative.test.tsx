import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "../../test/test-utils";
import { CommitDiffViewer } from "./CommitDiffViewer";
import * as api from "../lib/api";
import { createMockCommit } from "../../test/factories/commit.factory";

vi.mock("../lib/api", async () => {
	const actual = await vi.importActual("../lib/api");
	return {
		...actual,
		getCommitDiff: vi.fn(),
		abandonCommit: vi.fn(),
		listCommits: vi.fn(),
	};
});

describe("CommitDiffViewer tentative working copy", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("shows actions for the tentative working copy row", async () => {
		const user = userEvent.setup();
		const tentativeCommit = createMockCommit({
			commit_id: "wc-tentative",
			short_id: "wc-tentative",
			description: "(no description)",
			is_working_copy: true,
			timestamp: "2024-01-16 10:00:00",
		});
		const activeCommit = createMockCommit({
			commit_id: "active001",
			short_id: "active001",
			change_id: "chg_active1",
			description: "Active workspace commit",
			timestamp: "2024-01-15 09:00:00",
		});

		vi.mocked(api.listCommits).mockResolvedValue({
			commits: [tentativeCommit, activeCommit],
			tentative_working_copy: {
				workspace_label: "feat/test",
				commit: tentativeCommit,
			},
			target_branch: "main",
			workspace_branch: "feat/test",
		});
		vi.mocked(api.getCommitDiff).mockResolvedValue({
			committed_files: [],
			hunks_by_file: [],
			too_large_to_render: false,
			render_block_reason: null,
		});

		const onViewTentativeChanges = vi.fn();
		const onDeleteTentativeChanges = vi.fn();

		render(
			<CommitDiffViewer
				repoPath="/test/repo"
				workspaceId={1}
				onViewTentativeChanges={onViewTentativeChanges}
				onDeleteTentativeChanges={onDeleteTentativeChanges}
			/>,
		);

		await waitFor(() => {
			expect(screen.getAllByText("Working copy").length).toBeGreaterThan(0);
			expect(screen.getByText("- feat/test")).toBeInTheDocument();
		});

		const workingCopyButton = screen.getByText("- feat/test").closest("button");
		expect(workingCopyButton).toBeTruthy();
		await user.click(workingCopyButton);

		expect(
			workingCopyButton!.querySelector("svg.lucide-chevron-right"),
		).toBeInTheDocument();

		expect(
			await screen.findByRole("button", { name: /view changes/i }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /move changes/i }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /delete changes/i }),
		).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: /view changes/i }));
		expect(onViewTentativeChanges).toHaveBeenCalledTimes(1);

		await user.click(screen.getByRole("button", { name: /delete changes/i }));
		expect(onDeleteTentativeChanges).toHaveBeenCalledTimes(1);
	});
});
