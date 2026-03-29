import { describe, it, expect, vi, beforeEach } from "vitest";
import * as React from "react";
import fs from "fs";
import path from "path";
import { render, screen, waitFor, fireEvent } from "../../test-utils";
import userEvent from "@testing-library/user-event";
import { createTestRepo, openRepo } from "../../utils";
import { createWorkspace } from "../../../src/lib/api";
import { Dashboard } from "../../../src/components/Dashboard";

// jj_get_changed_files is not implemented in NAPI integration tests.
// Mock it here so FileBrowser doesn't trigger the forbidden jj_* invoke.
vi.mock("../../../src/lib/api", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../../src/lib/api")>();
	return {
		...actual,
		jjGetChangedFiles: vi.fn().mockResolvedValue([]),
	};
});

describe("ShowWorkspace - Code tab", () => {
	let repoPath: string;

	beforeEach(() => {
		({ repoPath } = createTestRepo(false));
		openRepo(repoPath);
	});

	it("shows Code tab", async () => {
		await createWorkspace(repoPath, "feat/code-tab-test");
		render(<Dashboard />);

		// defaults to code tab
		await screen.findByText("Code");
		await screen.findByText("README.md", { selector: "div,span,a" });
		// has linear commit history sidebar
		await screen.findByText("Initial commit");
	});

	it("renders README.md content in the Code tab overview", async () => {
		await createWorkspace(repoPath, "feat/readme-render-test");
		render(<Dashboard />);

		// Section heading "README.md" (the <h2> label in ShowWorkspace)
		await screen.findByRole("heading", { name: "README.md" });
		// Rendered markdown body – createTestRepo writes "# Test Repository\n" → <h1>
		await screen.findByRole("heading", { name: "Test Repository" });
	});

	it("clicking a non-readme file opens FileBrowser and allows line comments to start an agent", async () => {
		const user = userEvent.setup();
		vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);

		// The Dashboard starts in home-repo mode (selectedWorkspace === null),
		// so the overview shows files from the repo root (workingDirectory = repoPath).
		// Write main.ts there so it appears in the file listing.
		fs.writeFileSync(path.join(repoPath, "main.ts"), "const x = 1;\n");

		// No workspace needed – home repo view is sufficient
		render(<Dashboard />);

		// Wait for the overview to load
		await screen.findByText("Code");

		// main.ts should appear in the file listing
		const mainTsText = await screen.findByText("main.ts");
		const mainTsButton = mainTsText.closest("button")!;
		expect(mainTsButton).toBeTruthy();

		// Click main.ts → triggers handleOverviewEntryClick → setShowFileBrowserInCode(true)
		await user.click(mainTsButton);

		// FileBrowser is now shown – a "Back" button appears in the header
		const backButton = await screen.findByRole("button", { name: /back/i });
		expect(backButton).toBeTruthy();

		// File content is rendered – wait for at least one CodeLine to appear.
		// The CodeLine inner div has the exact class "hover:bg-muted/30" (from cn(...)).
		// (FileBrowser may auto-select README.md after rootEntries loads — either file is fine.)
		await waitFor(
			() => {
				const el = document.querySelector('[class*="hover:bg-muted/30"]');
				expect(el).toBeTruthy();
			},
			{ timeout: 5000 },
		);

		// Trigger React's onMouseEnter on the code line to reveal the "+" button.
		// React 18 implements onMouseEnter by listening for mouseover at the root,
		// so we fire both mouseover and mouseenter for maximum compatibility.
		const codeLineDiv = document.querySelector(
			'[class*="hover:bg-muted/30"]',
		) as HTMLElement;
		fireEvent.mouseOver(codeLineDiv);
		fireEvent.mouseEnter(codeLineDiv);

		// The "+" (Add comment) button appears on hover
		const addCommentButton = await screen.findByTitle("Add comment");
		await user.click(addCommentButton);

		// CommentInput renders with the textarea
		const textarea = await screen.findByPlaceholderText("Add a comment...");
		await user.type(textarea, "Fix this line");

		// Clicking "Add Comment" submits the comment and starts an agent session
		const submitButton = screen.getByRole("button", { name: "Add Comment" });
		await user.click(submitButton);

		// CommentInput disappears – agent creation was triggered
		await waitFor(() => {
			expect(screen.queryByPlaceholderText("Add a comment...")).toBeNull();
		});
	});
});
