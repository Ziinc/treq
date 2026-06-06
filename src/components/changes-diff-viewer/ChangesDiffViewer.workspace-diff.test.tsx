import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "../../../test/test-utils";
import { ChangesDiffViewer } from "./ChangesDiffViewerMain";

vi.mock("../../lib/api", async () => {
	const actual =
		await vi.importActual<typeof import("../../lib/api")>(
			"../../lib/api",
		);
	return {
		...actual,
		getWorkspaceDiff: vi.fn(),
		getWorkspaceChangedFiles: vi.fn().mockResolvedValue([]),
		getWorkspaceFileHunks: vi.fn().mockResolvedValue([]),
		getDiffCache: vi.fn().mockResolvedValue(null),
	};
});

describe("ChangesDiffViewer workspace diff contract", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("renders committed and uncommitted files from getWorkspaceDiff", async () => {
		const api = await import("../../lib/api");
		vi.mocked(api.getWorkspaceDiff).mockResolvedValue({
			files: [
				{
					path: "src/committed.ts",
					status: "M",
					changed_line_count: 1,
					diff_deferred: false,
				},
			],
			hunks_by_file: [
				{
					path: "src/committed.ts",
					hunks: [],
				},
			],
			uncommitted_files: [
				{
					path: "src/local.ts",
					status: "M",
					changed_line_count: 1,
					diff_deferred: false,
				},
			],
			conflicted_files: ["src/committed.ts"],
			too_large_to_render: false,
			render_block_reason: null,
		});

		render(
			<ChangesDiffViewer
				workspacePath="/tmp/workspace"
				repoPath="/tmp/repo"
				workspaceId={1}
				initialSelectedFile={null}
				showCommittedChanges={true}
			/>,
		);

		await waitFor(() => {
			expect(screen.getByText("committed.ts")).toBeInTheDocument();
		});
		await waitFor(() => {
			expect(screen.getByText("local.ts")).toBeInTheDocument();
		});
		expect(api.getWorkspaceChangedFiles).not.toHaveBeenCalled();
	});
});
