import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "./test-utils";
import * as api from "../src/lib/api";
import { ChangesDiffViewer } from "../src/components/ChangesDiffViewer";

vi.mock("../src/lib/api", async () => {
	const actual = await vi.importActual("../src/lib/api");
	return {
		...actual,
		jjGetChangedFiles: vi.fn(),
		jjGetFileHunks: vi.fn(),
		jjGetFileLines: vi.fn(),
	};
});

vi.mock("@tauri-apps/plugin-opener", () => ({
	revealItemInDir: vi.fn(),
	openUrl: vi.fn(),
}));

describe("ChangesDiffViewer - Expand Context Lines", () => {
	const mockFiles = [{ path: "src/app.ts", status: "M", previous_path: null }];

	const mockHunks: api.JjDiffHunk[] = [
		{
			id: "hunk-1",
			header: "@@ -50,3 +50,4 @@ function example()",
			lines: [
				" const a = 1;",
				"-const b = 2;",
				"+const b = 3;",
				"+const c = 4;",
			],
			patch: "",
		},
	];

	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(api.jjGetChangedFiles).mockResolvedValue(mockFiles);
		vi.mocked(api.jjGetFileHunks).mockResolvedValue(mockHunks);
		vi.mocked(api.jjGetFileLines).mockResolvedValue({
			lines: [],
			start_line: 0,
			end_line: 0,
		});
	});

	it("should show expand buttons when hunk is rendered", async () => {
		render(
			<ChangesDiffViewer workspacePath="/repo" initialSelectedFile={null} />,
		);

		// Wait for diff to render (hunk header text should appear)
		await waitFor(() => {
			expect(
				screen.getByText("@@ -50,3 +50,4 @@ function example()"),
			).toBeInTheDocument();
		});

		expect(screen.getByText("Show more lines above")).toBeInTheDocument();
		expect(screen.getByText("Show more lines below")).toBeInTheDocument();
	});

	it("should call jjGetFileLines when clicking expand above", async () => {
		vi.mocked(api.jjGetFileLines).mockResolvedValue({
			lines: ["// line 30", "// line 31"],
			start_line: 30,
			end_line: 31,
		});

		render(
			<ChangesDiffViewer workspacePath="/repo" initialSelectedFile={null} />,
		);

		await waitFor(() => {
			expect(
				screen.getByText("@@ -50,3 +50,4 @@ function example()"),
			).toBeInTheDocument();
		});

		fireEvent.click(screen.getByText("Show more lines above"));

		await waitFor(() => {
			expect(api.jjGetFileLines).toHaveBeenCalledWith(
				"/repo",
				"src/app.ts",
				false,
				30, // max(1, 50 - 20) = 30
				49, // 50 - 1
			);
		});
	});

	it("should call jjGetFileLines when clicking expand below", async () => {
		vi.mocked(api.jjGetFileLines).mockResolvedValue({
			lines: ["// line 54", "// line 55"],
			start_line: 54,
			end_line: 55,
		});

		render(
			<ChangesDiffViewer workspacePath="/repo" initialSelectedFile={null} />,
		);

		await waitFor(() => {
			expect(
				screen.getByText("@@ -50,3 +50,4 @@ function example()"),
			).toBeInTheDocument();
		});

		fireEvent.click(screen.getByText("Show more lines below"));

		await waitFor(() => {
			expect(api.jjGetFileLines).toHaveBeenCalledWith(
				"/repo",
				"src/app.ts",
				false,
				54, // newStart(50) + newCount(4) + 0 existing = 54
				73, // 54 + 20 - 1
			);
		});
	});

	it("should render fetched context lines above the hunk", async () => {
		vi.mocked(api.jjGetFileLines).mockResolvedValue({
			lines: ["// context above 1", "// context above 2"],
			start_line: 48,
			end_line: 49,
		});

		render(
			<ChangesDiffViewer workspacePath="/repo" initialSelectedFile={null} />,
		);

		await waitFor(() => {
			expect(
				screen.getByText("@@ -50,3 +50,4 @@ function example()"),
			).toBeInTheDocument();
		});

		fireEvent.click(screen.getByText("Show more lines above"));

		await waitFor(() => {
			expect(screen.getByText("// context above 1")).toBeInTheDocument();
			expect(screen.getByText("// context above 2")).toBeInTheDocument();
		});
	});

	it("should render fetched context lines below the hunk", async () => {
		vi.mocked(api.jjGetFileLines).mockResolvedValue({
			lines: ["// context below 1", "// context below 2"],
			start_line: 54,
			end_line: 55,
		});

		render(
			<ChangesDiffViewer workspacePath="/repo" initialSelectedFile={null} />,
		);

		await waitFor(() => {
			expect(
				screen.getByText("@@ -50,3 +50,4 @@ function example()"),
			).toBeInTheDocument();
		});

		fireEvent.click(screen.getByText("Show more lines below"));

		await waitFor(() => {
			expect(screen.getByText("// context below 1")).toBeInTheDocument();
			expect(screen.getByText("// context below 2")).toBeInTheDocument();
		});
	});

	it("should use w-24 for line number columns to prevent overlap with large line numbers", async () => {
		render(
			<ChangesDiffViewer workspacePath="/repo" initialSelectedFile={null} />,
		);

		await waitFor(() => {
			expect(
				screen.getByText("@@ -50,3 +50,4 @@ function example()"),
			).toBeInTheDocument();
		});

		// The hunk header row is the parent of the header text
		const headerText = screen.getByText("@@ -50,3 +50,4 @@ function example()");
		const hunkHeaderRow = headerText.closest(".flex.items-stretch")!;
		// The first child of the hunk header row is the line number column
		const lineNumCol = hunkHeaderRow.firstElementChild!;

		// Verify the line number column uses w-24 (wider) instead of w-16 (narrow)
		expect(lineNumCol.className).toContain("w-24");
		expect(lineNumCol.className).not.toContain("w-16");

		// Also check a diff line's line number column
		// Line "50" appears in both old and new columns - use getAllByText
		const lineNum50s = screen.getAllByText("50");
		expect(lineNum50s.length).toBeGreaterThan(0);
		const lineNumContainer = lineNum50s[0].closest(
			"[class*='flex-shrink-0'][class*='border-r']",
		)!;
		expect(lineNumContainer.className).toContain("w-24");
		expect(lineNumContainer.className).not.toContain("w-16");
	});

	it("should not show expand above button when hunk starts at line 1", async () => {
		const hunksAtStart: api.JjDiffHunk[] = [
			{
				id: "hunk-start",
				header: "@@ -1,2 +1,3 @@",
				lines: [" first line", "+added line", " second line"],
				patch: "",
			},
		];
		vi.mocked(api.jjGetFileHunks).mockResolvedValue(hunksAtStart);

		render(
			<ChangesDiffViewer workspacePath="/repo" initialSelectedFile={null} />,
		);

		await waitFor(() => {
			expect(screen.getByText("@@ -1,2 +1,3 @@")).toBeInTheDocument();
		});

		// Hunk starts at line 1, no room above
		expect(screen.queryByText("Show more lines above")).not.toBeInTheDocument();
		// Below button should still be present
		expect(screen.getByText("Show more lines below")).toBeInTheDocument();
	});
});
