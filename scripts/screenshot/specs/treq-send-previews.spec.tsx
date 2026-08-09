import * as React from "react";
import { expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { listen } from "@tauri-apps/api/event";
import {
	createTestRepo,
	findSidebarBranchElement,
	openRepo,
} from "../../../test/utils";
import { render, screen, waitFor } from "../../../test/test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import { createWorkspace } from "../../../src/lib/api";
import { TREQ_SEND_EVENT } from "../../../src/lib/treqSend";
import { captureDocument } from "../capture";
import fs from "node:fs";
import path from "node:path";

type SendPayload = {
	kind: string;
	request_id: string;
	repo: string;
	pty_session_id: string;
	media_type: string;
	path: string;
	title: string;
};

it("captures treq send square previews and text/image modals in a shell terminal", async () => {
	const { repoPath } = createTestRepo(false);
	openRepo(repoPath);
	await createWorkspace(repoPath, "feat/treq-send");

	const notePath = path.join(repoPath, "preview-note.txt");
	fs.writeFileSync(
		notePath,
		"Selectable preview text from treq send.\nLine two.\n",
	);

	const imagePath = path.join(repoPath, "preview-shot.svg");
	fs.writeFileSync(
		imagePath,
		`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128">
  <rect width="128" height="128" fill="#2563eb"/>
  <circle cx="64" cy="64" r="36" fill="#f8fafc"/>
</svg>
`,
	);

	const user = userEvent.setup();
	render(<Dashboard />);

	await user.click(await findSidebarBranchElement("feat/treq-send"));
	await screen.findByText(/Terminals/i);
	await user.click(await screen.findByRole("button", { name: "New Shell" }));

	await waitFor(() => {
		expect(
			document.querySelector('[data-terminal-id^="shell-"]'),
		).not.toBeNull();
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
		payload: SendPayload;
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
	sendCallback({
		payload: {
			kind: "send",
			request_id: "qa-send-image",
			repo: repoPath,
			pty_session_id: ptySessionId!,
			media_type: "image",
			path: imagePath,
			title: "preview-shot.svg",
		},
	});

	expect(
		await screen.findByTestId("terminal-send-preview-qa-send-text"),
	).toBeTruthy();
	const imageThumb = await screen.findByTestId(
		"terminal-send-preview-qa-send-image",
	);
	expect(await screen.findByTestId("terminal-send-previews")).toBeTruthy();
	expect(imageThumb.querySelector("img")).toBeTruthy();

	await captureDocument(document, {
		name: "treq-send-01-square-previews",
		expectations: [
			"A shell terminal is open under the feat/treq-send workspace.",
			"Two square thumbnails float over the bottom of the dark terminal on a gradient fade.",
			"Each thumbnail has a visible circular X dismiss control, and the image thumb is blue with a white circle.",
		],
	});

	await user.click(screen.getByTestId("terminal-send-dismiss-qa-send-text"));
	await waitFor(() => {
		expect(
			screen.queryByTestId("terminal-send-preview-qa-send-text"),
		).toBeNull();
	});
	expect(
		screen.getByTestId("terminal-send-preview-qa-send-image"),
	).toBeTruthy();

	await captureDocument(document, {
		name: "treq-send-01b-after-dismiss",
		expectations: [
			"Only the blue image thumbnail remains overlaid on the terminal.",
			"The text thumbnail is gone after clicking its X dismiss button.",
		],
	});

	await user.click(imageThumb);
	expect(await screen.findByTestId("treq-send-preview-modal")).toBeTruthy();
	expect(
		document.querySelector('[data-testid="treq-send-preview-modal"] img'),
	).toBeTruthy();

	await captureDocument(document, {
		name: "treq-send-03-image-modal",
		expectations: [
			"A modal titled preview-shot.svg overlays the app.",
			"The modal shows a large blue square image with a white circle centered in it.",
		],
	});

	await user.click(await screen.findByRole("button", { name: "Close preview" }));
	await waitFor(() => {
		expect(screen.queryByTestId("treq-send-preview-modal")).toBeNull();
	});

	// Re-inject text so the text modal path stays covered
	sendCallback({
		payload: {
			kind: "send",
			request_id: "qa-send-text-2",
			repo: repoPath,
			pty_session_id: ptySessionId!,
			media_type: "text",
			path: notePath,
			title: "preview-note.txt",
		},
	});
	const textThumbAgain = await screen.findByTestId(
		"terminal-send-preview-qa-send-text-2",
	);
	await user.click(textThumbAgain);
	expect(await screen.findByTestId("treq-send-preview-modal")).toBeTruthy();
	await screen.findByTestId("treq-send-text-preview");

	await captureDocument(document, {
		name: "treq-send-02-text-modal",
		expectations: [
			"A modal titled preview-note.txt overlays the app.",
			"The modal body shows selectable text including 'Selectable preview text from treq send'.",
		],
	});
}, 60000);
