import * as React from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTestRepo } from "../utils";
import { ensureWorkspaceIndexed } from "../../src/lib/api";
import { render, screen } from "../test-utils";
import { FileBrowser } from "../../src/components/FileBrowser";

describe("FileBrowser text selection", () => {
	let repoPath: string;

	beforeEach(async () => {
		const repo = createTestRepo(false);
		repoPath = repo.repoPath;
		await ensureWorkspaceIndexed(repoPath, null, repoPath);
	});

	it("does not block native text selection on double-click mousedown", async () => {
		render(
			<FileBrowser
				workspace={null}
				repoPath={repoPath}
				initialSelectedFile={null}
				initialExpandedDir={null}
			/>,
		);

		// createTestRepo seeds a README.md which FileBrowser auto-selects.
		const lines = await screen.findAllByTestId("code-line");
		expect(lines.length).toBeGreaterThan(0);
		const line = lines[0];

		// fireEvent returns false when the handler called preventDefault.
		const notPrevented = fireEvent.mouseDown(line, { button: 0, detail: 2 });
		expect(notPrevented).toBe(true);
	});

	it("copies the selected line text to the clipboard", async () => {
		const user = userEvent.setup({ writeToClipboard: true });
		render(
			<FileBrowser
				workspace={null}
				repoPath={repoPath}
				initialSelectedFile={null}
				initialExpandedDir={null}
			/>,
		);

		const lines = await screen.findAllByTestId("code-line");
		const codeSpan = lines[0].querySelector(
			"span.flex-1",
		) as HTMLElement | null;
		expect(codeSpan).not.toBeNull();

		const range = document.createRange();
		range.selectNodeContents(codeSpan!);
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

		const lines = await screen.findAllByTestId("code-line");
		const line = lines[0];

		fireEvent.mouseDown(line, { button: 0, detail: 1 });
		fireEvent.mouseUp(line);

		const linesAfter = screen.getAllByTestId("code-line");
		expect(linesAfter[0].className).toMatch(/bg-blue-500\/20/);
	});
});
