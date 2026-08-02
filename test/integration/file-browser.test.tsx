import * as React from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTestRepo } from "../utils";
import { ensureWorkspaceIndexed } from "../../src/lib/api";
import { render, screen } from "../test-utils";
import { FileBrowser } from "../../src/components/FileBrowser";

describe("FileBrowser text selection", () => {
	let repoPath: string;
	let user: ReturnType<typeof userEvent.setup>;

	beforeEach(async () => {
		({ repoPath } = createTestRepo(false));
		await ensureWorkspaceIndexed(repoPath, null, repoPath);
		user = userEvent.setup({ writeToClipboard: true });
	});

	async function viewReadmeSource() {
		fireEvent.click(await screen.findByRole("tab", { name: "Code" }));
	}

	it("does not block native text selection on double-click mousedown", async () => {
		render(
			<FileBrowser
				workspace={null}
				repoPath={repoPath}
				initialSelectedFile={null}
				initialExpandedDir={null}
			/>,
		);
		await viewReadmeSource();

		const lines = await screen.findAllByTestId("code-line");
		expect(lines.length).toBeGreaterThan(0);
		const [line] = lines;

		const notPrevented = fireEvent.mouseDown(line, { button: 0, detail: 2 });
		expect(notPrevented).toBe(true);
	});

	it("copies the selected line text to the clipboard", async () => {
		render(
			<FileBrowser
				workspace={null}
				repoPath={repoPath}
				initialSelectedFile={null}
				initialExpandedDir={null}
			/>,
		);
		await viewReadmeSource();

		const lines = await screen.findAllByTestId("code-line");
		const codeSpan = within(lines[0]).getByTestId("code-line-content");

		const range = document.createRange();
		range.selectNodeContents(codeSpan);
		const selection = window.getSelection();
		expect(selection).not.toBeNull();
		selection!.removeAllRanges();
		selection!.addRange(range);

		const selectedText = selection!.toString();
		expect(selectedText.length).toBeGreaterThan(0);

		await user.copy();

		const copied = await navigator.clipboard.readText();
		expect(copied).toBe(selectedText);
	});

	it("still enters line selection on a single-click mousedown", async () => {
		render(
			<FileBrowser
				workspace={null}
				repoPath={repoPath}
				initialSelectedFile={null}
				initialExpandedDir={null}
			/>,
		);
		await viewReadmeSource();

		const lines = await screen.findAllByTestId("code-line");
		const [line] = lines;

		fireEvent.mouseDown(line, { button: 0, detail: 1 });
		fireEvent.mouseUp(line);

		const linesAfter = screen.getAllByTestId("code-line");
		expect(linesAfter[0]).toHaveClass("!bg-blue-500/20");
	});
});
