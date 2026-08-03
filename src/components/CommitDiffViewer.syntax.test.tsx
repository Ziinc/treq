import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JjRevisionDiff } from "../lib/api";
import * as api from "../lib/api";
import { CommitDiffViewer } from "./CommitDiffViewer";
import { ToastProvider } from "./ui/toast";

vi.mock("../lib/api", async () => ({
	...(await vi.importActual("../lib/api")),
	getCommitDiff: vi.fn(),
	listCommits: vi.fn(),
}));

const commit = {
	commit_id: "commit-1",
	short_id: "abc1234",
	change_id: "change-1",
	description: "Typed change",
	author_name: "Author",
	author_email: "author@example.com",
	timestamp: "2024-01-15 09:00:00",
	bookmarks: [],
	parent_ids: [],
	is_immutable: false,
	is_working_copy: false,
	on_target_only: false,
	insertions: 1,
	deletions: 0,
};

const diff: JjRevisionDiff = {
	committed_files: [
		{
			path: "src/main.ts",
			status: "M",
			previous_path: null,
			changed_line_count: 1,
			diff_deferred: false,
		},
	],
	hunks_by_file: [
		{
			path: "src/main.ts",
			hunks: [
				{
					id: "hunk-1",
					header: "@@ -1 +1 @@",
					lines: ["+const answer: number = 42;"],
					patch: "",
				},
			],
		},
	],
	too_large_to_render: false,
	render_block_reason: null,
};

describe("CommitDiffViewer syntax highlighting", () => {
	beforeEach(() => {
		vi.mocked(api.listCommits).mockResolvedValue({
			commits: [commit],
			target_branch: "main",
			workspace_branch: "feature",
		});
		vi.mocked(api.getCommitDiff).mockResolvedValue(diff);
	});

	it("highlights review source lines based on the file extension", async () => {
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const { container } = render(
			<QueryClientProvider client={queryClient}>
				<ToastProvider>
					<CommitDiffViewer repoPath="/repo" workspaceId={1} />
				</ToastProvider>
			</QueryClientProvider>,
		);
		fireEvent.click(await screen.findByText("Typed change"));
		await waitFor(() => expect(screen.getByText("src/main.ts")).toBeTruthy());

		expect(container.querySelector(".token.keyword")?.textContent).toBe(
			"const",
		);
		expect(container.querySelector(".token.number")?.textContent).toBe("42");
	});
});
