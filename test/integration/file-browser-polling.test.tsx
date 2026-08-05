import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { act, fireEvent, render, screen } from "../test-utils";
import * as api from "../../src/lib/api";
import { FileBrowser } from "../../src/components/FileBrowser";

vi.mock("../../src/lib/api", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../src/lib/api")>();
	return {
		...actual,
		ensureWorkspaceIndexed: vi.fn().mockResolvedValue(undefined),
		getFileModifiedAt: vi.fn().mockResolvedValue(null),
		getWorkspaceChangedFiles: vi.fn(),
		getWorkspaceFileHunks: vi.fn().mockResolvedValue([]),
		listDirectory: vi.fn(),
		readFile: vi.fn(),
	};
});

describe("FileBrowser polling", () => {
	let user: ReturnType<typeof userEvent.setup>;

	beforeEach(() => {
		vi.clearAllMocks();
		user = userEvent.setup();
	});

	it("preserves a comment draft when changed-file polling completes", async () => {
		let finishPolling!: (
			files: Awaited<ReturnType<typeof api.getWorkspaceChangedFiles>>,
		) => void;
		vi.mocked(api.getWorkspaceChangedFiles).mockReturnValue(
			new Promise((resolve) => {
				finishPolling = resolve;
			}),
		);
		vi.mocked(api.listDirectory).mockResolvedValue([]);
		vi.mocked(api.readFile).mockResolvedValue("const value = 1;\n");

		render(
			<FileBrowser
				workspace={null}
				repoPath="/repo"
				initialSelectedFile="/repo/specific.ts"
				initialExpandedDir={null}
			/>,
		);

		const [line] = await screen.findAllByTestId("code-line");
		fireEvent.mouseEnter(line);
		await user.click(await screen.findByTitle("Add comment"));
		const textarea = await screen.findByPlaceholderText("Add a comment...");
		await user.type(textarea, "keep this draft");

		await act(async () => {
			finishPolling([
				{
					path: "specific.ts",
					status: "M",
					previous_path: null,
					changed_line_count: 1,
					diff_deferred: false,
				},
			]);
			await Promise.resolve();
		});

		expect(api.readFile).toHaveBeenCalledTimes(1);
		expect(screen.getByPlaceholderText("Add a comment...")).toHaveValue(
			"keep this draft",
		);
	});
});
