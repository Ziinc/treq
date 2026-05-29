import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "../../test-utils";
import userEvent from "@testing-library/user-event";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
	type Workspace,
	createWorkspace,
	getWorkspaces,
} from "../../../src/lib/api";
import { Dashboard } from "../../../src/components/Dashboard";
import {
	createTestRepo,
	findSidebarBranchElement,
	openRepo,
	resolveWorkspacePath,
	writeWorkspaceFile,
} from "../../utils";

async function setupWorkspace(
	branchName: string,
	files: Record<string, string>,
): Promise<{
	repoPath: string;
	workspace: Workspace;
	workspacePath: string;
}> {
	const { repoPath } = createTestRepo(false);
	openRepo(repoPath);

	const workspaceId = await createWorkspace(repoPath, branchName);
	const workspace = (await getWorkspaces(repoPath)).find(
		(candidate) => candidate.id === workspaceId,
	);
	if (!workspace) {
		throw new Error(`Workspace not found for id ${workspaceId}`);
	}

	const workspacePath = resolveWorkspacePath(
		repoPath,
		workspace.workspace_path,
	);
	for (const [relativePath, content] of Object.entries(files)) {
		writeWorkspaceFile(workspacePath, relativePath, content);
	}

	return { repoPath, workspace, workspacePath };
}

async function openWorkspaceCodeBrowser(
	user: ReturnType<typeof userEvent.setup>,
	branchName: string,
	fileName: string,
) {
	render(<Dashboard />);
	await user.click(await findSidebarBranchElement(branchName));
	await user.click(await screen.findByRole("button", { name: fileName }));
	const fileBrowser = await screen.findByTestId("file-browser");
	return within(fileBrowser);
}

describe("Dashboard - FileBrowser integration", () => {
	let user: ReturnType<typeof userEvent.setup>;

	beforeEach(() => {
		user = userEvent.setup({ writeToClipboard: true });
		vi.clearAllMocks();
		vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
	});

	it("opens a selected file in the code browser and renders its contents", async () => {
		await setupWorkspace("feat/filebrowser-open-test", {
			"app.ts": "export function runApp() {\n  return 'ready';\n}\n",
			"src/helper.ts": "export const helper = true;\n",
		});

		const fileBrowser = await openWorkspaceCodeBrowser(
			user,
			"feat/filebrowser-open-test",
			"app.ts",
		);

		const appTsLabels = await fileBrowser.findAllByText("app.ts");
		expect(appTsLabels.length).toBeGreaterThan(1);
		await fileBrowser.findByText("runApp");
		await screen.findByRole("button", { name: /back/i });
	});

	it("supports in-file search open, navigation, highlighting, and close", async () => {
		await setupWorkspace("feat/filebrowser-search-test", {
			"search-target.ts":
				"function alpha() {\n  return 'alpha';\n}\n\nfunction beta() {\n  return 'beta';\n}\n",
		});

		await openWorkspaceCodeBrowser(
			user,
			"feat/filebrowser-search-test",
			"search-target.ts",
		);

		await waitFor(() => {
			expect(screen.getAllByTestId("code-line").length).toBeGreaterThan(0);
		});
		await user.keyboard("{Control>}f{/Control}");

		const searchInput = await screen.findByPlaceholderText("Find");
		await user.type(searchInput, "function");

		await screen.findByText("1 of 2");
		await waitFor(() => {
			expect(document.querySelectorAll("mark").length).toBeGreaterThan(0);
		});

		await user.keyboard("{Enter}");
		await screen.findByText("2 of 2");

		await user.keyboard("{Shift>}{Enter}{/Shift}");
		await screen.findByText("1 of 2");

		await user.keyboard("{Escape}");
		await waitFor(() => {
			expect(screen.queryByPlaceholderText("Find")).toBeNull();
		});
		await waitFor(() => {
			expect(document.querySelectorAll("mark")).toHaveLength(0);
		});
	});

	it("shows file tree context menu actions for files and directories", async () => {
		const { workspacePath } = await setupWorkspace(
			"feat/filebrowser-context-menu-test",
			{
				"menu-target.ts": "export const menuTarget = true;\n",
				"src/nested.ts": "export const nested = true;\n",
			},
		);

		const fileBrowser = await openWorkspaceCodeBrowser(
			user,
			"feat/filebrowser-context-menu-test",
			"menu-target.ts",
		);

		const [fileEntry] = await fileBrowser.findAllByText("menu-target.ts");
		fireEvent.contextMenu(fileEntry);
		await screen.findByText("Copy relative path");
		await user.click(await screen.findByTestId("copy-relative-path"));
		expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith(
			"menu-target.ts",
		);

		fireEvent.contextMenu(fileEntry);
		await user.click(await screen.findByTestId("copy-full-path"));
		expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith(
			`${workspacePath}/menu-target.ts`,
		);

		fireEvent.contextMenu(fileEntry);
		const openInMenu = await screen.findByText("Open in...");
		fireEvent.pointerMove(openInMenu);
		fireEvent.mouseEnter(openInMenu);
		fireEvent.keyDown(openInMenu, { key: "ArrowRight" });
		await screen.findByText("Open in Finder");
		await user.click(await screen.findByText("Open in Finder"));
		await waitFor(() => {
			expect(revealItemInDir).toHaveBeenLastCalledWith(
				`${workspacePath}/menu-target.ts`,
			);
		});

		const directoryEntry = await fileBrowser.findByText("src");
		fireEvent.contextMenu(directoryEntry);
		await screen.findByText("Copy relative path");
		await screen.findByText("Copy full path");
		await screen.findByText("Open in...");
	});

	it("keeps selected text when pointer moves to another code line before copy", async () => {
		await setupWorkspace("feat/filebrowser-selection-persist-test", {
			"selection-target.ts":
				"const selectedSnippet = 'persist_me';\nconst otherLine = 'cursor moved';\n",
		});

		await openWorkspaceCodeBrowser(
			user,
			"feat/filebrowser-selection-persist-test",
			"selection-target.ts",
		);

		await waitFor(() => {
			expect(screen.getAllByTestId("code-line").length).toBeGreaterThan(1);
		});

		const [firstLine, secondLine] = screen.getAllByTestId("code-line");
		const firstLineContent = within(firstLine).getByTestId("code-line-content");

		const range = document.createRange();
		range.selectNodeContents(firstLineContent);

		const selection = window.getSelection();
		expect(selection).not.toBeNull();
		selection!.removeAllRanges();
		selection!.addRange(range);
		const selectedText = selection!.toString();
		expect(selectedText).toContain("selectedSnippet");

		fireEvent.mouseEnter(secondLine);
		fireEvent.mouseMove(secondLine);

		await user.copy();

		expect(await navigator.clipboard.readText()).toBe(selectedText);
	});
});
