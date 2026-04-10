import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "./test-utils";
import { ChangesDiffViewer } from "../src/components/ChangesDiffViewer";
import * as api from "../src/lib/api";

vi.mock("../src/lib/api", async () => {
	const actual = await vi.importActual("../src/lib/api");
	return {
		...actual,
		jjGetChangedFiles: vi.fn(),
		jjGetFileHunks: vi.fn(),
		getDiffCache: vi.fn(),
		loadPendingReview: vi.fn(),
		savePendingReview: vi.fn(),
		clearPendingReview: vi.fn(),
		setDiffCache: vi.fn(),
	};
});

describe("Bug #2: Conflict Display Duplication", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(api.getDiffCache).mockResolvedValue([]);
		vi.mocked(api.loadPendingReview).mockResolvedValue({
			comments: [],
			conflictComments: [],
		});
		vi.mocked(api.savePendingReview).mockResolvedValue();
		vi.mocked(api.clearPendingReview).mockResolvedValue();
		vi.mocked(api.setDiffCache).mockResolvedValue();
	});

	it("should not render ConflictsSection when conflicts exist", async () => {
		// Setup conflicted file
		vi.mocked(api.jjGetChangedFiles).mockResolvedValue([
			{ path: "src/App.tsx", status: "M", previous_path: null },
		]);

		vi.mocked(api.jjGetFileHunks).mockResolvedValue([
			{
				id: "hunk-1",
				header: "@@ -1,5 +1,5 @@",
				lines: [
					" function App() {",
					"<<<<<<< Conflict 1 of 1",
					"+  console.log('version A');",
					"=======",
					"+  console.log('version B');",
					">>>>>>> Conflict 1 of 1 ends",
					" }",
				],
				patch: "...",
			},
		]);

		render(
			<ChangesDiffViewer
				workspacePath="/test/workspace"
				repoPath="/test/repo"
				workspaceId={1}
				initialSelectedFile={null}
			/>,
		);

		// Wait for content to load
		await waitFor(() => {
			expect(screen.getAllByText(/App\.tsx/).length).toBeGreaterThan(0);
		});

		// ConflictsSection should NOT be rendered
		// Verify by checking that no separate conflicts section header exists
		expect(screen.queryByTestId("conflicts-section")).not.toBeInTheDocument();

		// Verify the file is still displayed in the main changes view
		expect(screen.getAllByText(/App\.tsx/).length).toBeGreaterThan(0);
	});

	it("should not render ConflictsSection when multiple conflicted files exist", async () => {
		vi.mocked(api.jjGetChangedFiles).mockResolvedValue([
			{ path: "file1.tsx", status: "M", previous_path: null },
			{ path: "file2.tsx", status: "M", previous_path: null },
		]);

		vi.mocked(api.jjGetFileHunks).mockResolvedValue([
			{
				id: "hunk-1",
				header: "@@ -1,3 +1,3 @@",
				lines: [
					"<<<<<<< Conflict 1 of 1",
					"+ version A",
					"=======",
					"+ version B",
					">>>>>>> Conflict 1 of 1 ends",
				],
				patch: "...",
			},
		]);

		render(
			<ChangesDiffViewer
				workspacePath="/test/workspace"
				repoPath="/test/repo"
				workspaceId={1}
				initialSelectedFile={null}
			/>,
		);

		await waitFor(() => {
			expect(screen.getByText(/file1\.tsx/)).toBeInTheDocument();
		});

		// Verify ConflictsSection is not present with test-id
		expect(screen.queryByTestId("conflicts-section")).not.toBeInTheDocument();

		// Verify files are displayed (showing that detail view is there instead)
		expect(screen.getAllByText(/file1\.tsx/).length).toBeGreaterThan(0);
		expect(screen.getAllByText(/file2\.tsx/).length).toBeGreaterThan(0);
	});
});
