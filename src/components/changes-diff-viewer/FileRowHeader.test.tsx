import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "../../../test/test-utils";
import userEvent from "@testing-library/user-event";
import { ChangesDiffViewer } from "./ChangesDiffViewerMain";

vi.mock("../../lib/api", async () => {
	const actual =
		await vi.importActual<typeof import("../../lib/api")>("../../lib/api");
	return {
		...actual,
		getWorkspaceDiff: vi.fn(),
		getWorkspaceChangedFiles: vi.fn().mockResolvedValue([]),
		getWorkspaceFileHunks: vi.fn().mockResolvedValue([]),
		getDiffCache: vi.fn().mockResolvedValue(null),
	};
});

describe("Review tab collapsible copy file path button", () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		const api = await import("../../lib/api");
		vi.mocked(api.getWorkspaceDiff).mockResolvedValue({
			committed_files: [
				{
					path: "src/example.ts",
					status: "M",
					changed_line_count: 1,
					diff_deferred: false,
				},
			],
			hunks_by_file: [
				{
					path: "src/example.ts",
					hunks: [
						{
							id: "hunk-1",
							header: "@@ -1,1 +1,1 @@",
							lines: ["-old", "+new"],
							patch: "...",
						},
					],
				},
			],
			uncommitted_files: [],
			conflicted_files: [],
			too_large_to_render: false,
			render_block_reason: null,
		});
	});

	it("copies the file path to the clipboard when clicked", async () => {
		const user = userEvent.setup();
		const clipboardSpy = vi
			.spyOn(navigator.clipboard, "writeText")
			.mockResolvedValue(undefined);

		render(
			<ChangesDiffViewer
				workspacePath="/tmp/workspace"
				repoPath="/tmp/repo"
				workspaceId={1}
				initialSelectedFile={null}
				showCommittedChanges={true}
			/>,
		);

		const copyButton = await screen.findByRole("button", {
			name: "Copy file path",
		});
		await user.click(copyButton);

		await waitFor(() => {
			expect(clipboardSpy).toHaveBeenCalledWith("src/example.ts");
		});
		expect(
			await screen.findByText("File path copied to clipboard"),
		).toBeInTheDocument();
	});

	it("does not show a success toast when clipboard write fails", async () => {
		const user = userEvent.setup();
		vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
			new Error("Clipboard permission denied"),
		);

		render(
			<ChangesDiffViewer
				workspacePath="/tmp/workspace"
				repoPath="/tmp/repo"
				workspaceId={1}
				initialSelectedFile={null}
				showCommittedChanges={true}
			/>,
		);

		const copyButton = await screen.findByRole("button", {
			name: "Copy file path",
		});
		await user.click(copyButton);

		expect(
			await screen.findByText("Clipboard permission denied"),
		).toBeInTheDocument();
		expect(
			screen.queryByText("File path copied to clipboard"),
		).not.toBeInTheDocument();
	});
});
