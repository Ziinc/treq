import * as React from "react";
import { expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { listen } from "@tauri-apps/api/event";
import { createTestRepo, findSidebarBranchElement, openRepo } from "../../../test/utils";
import { render, screen, waitFor } from "../../../test/test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import { createWorkspace } from "../../../src/lib/api";
import { TREQ_SEND_EVENT } from "../../../src/lib/treqSend";
import { captureDocument } from "../capture";
import fs from "node:fs";
import path from "node:path";

it("captures treq send square previews and text modal in a shell terminal", async () => {
	const { repoPath } = createTestRepo(false);
	openRepo(repoPath);
	await createWorkspace(repoPath, "feat/treq-send");

	const notePath = path.join(repoPath, "preview-note.txt");
	fs.writeFileSync(notePath, "Selectable preview text from treq send.\nLine two.\n");

	const user = userEvent.setup();
	render(<Dashboard />);

	await user.click(await findSidebarBranchElement("feat/treq-send"));
	await screen.findByText(/Terminals/i);
	await user.click(await screen.findByRole("button", { name: "New Shell" }));

	await waitFor(() => {
		expect(document.querySelector('[data-terminal-id^="shell-"]')).not.toBeNull();
	});

	const terminalEl = document.querySelector(
		'[data-terminal-id^="shell-"]',
	) as HTMLElement;
	const ptySessionId = terminalEl.getAttribute("data-terminal-id");
	expect(ptySessionId).toBeTruthy();

	await waitFor(() => {
		expect(
			vi.mocked(listen).mock.calls.some((args) => args[0] === TREQ_SEND_EVENT),
		).toBe(true);
	});

	const sendCallback = vi
		.mocked(listen)
		.mock.calls.find((args) => args[0] === TREQ_SEND_EVENT)?.[1] as (event: {
		payload: {
			kind: string;
			request_id: string;
			repo: string;
			pty_session_id: string;
			media_type: string;
			path: string;
			title: string;
		};
	}) => void;

	sendCallback({
		payload: {
			kind: "send",
			request_id: "qa-send-text",
			repo: repoPath,
			pty_session_id: ptySessionId!,
			media_type: "text",
			path: notePath,
			title: "preview-note.txt",
		},
	});

	const thumb = await screen.findByTestId("terminal-send-preview-qa-send-text");
	expect(await screen.findByTestId("terminal-send-previews")).toBeTruthy();

	await captureDocument(document, {
		name: "treq-send-01-square-preview",
		expectations: [
			"A shell terminal panel is open for the feat/treq-send workspace.",
			"Above the terminal body, a horizontal strip shows a square thumbnail labeled preview-note.txt.",
		],
	});

	await user.click(thumb);
	expect(await screen.findByTestId("treq-send-preview-modal")).toBeTruthy();
	await screen.findByTestId("treq-send-text-preview");

	await captureDocument(document, {
		name: "treq-send-02-text-modal",
		expectations: [
			"A modal overlays the app titled preview-note.txt.",
			"The modal body shows the selectable text content including 'Selectable preview text from treq send'.",
		],
	});
}, 60000);
