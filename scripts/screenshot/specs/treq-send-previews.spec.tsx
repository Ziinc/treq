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

it("captures treq send attachment thumbs and lightbox carousel previews", async () => {
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
	expect(
		imageThumb.closest('[data-slot="attachment"]')?.querySelector("img"),
	).toBeTruthy();

	await captureDocument(document, {
		name: "treq-send-01-square-previews",
		expectations: [
			"Two dark h-14 square thumbnails sit at the top-left of the terminal in a horizontal row.",
			"The image thumb shows a blue square with a white circle; the text thumb shows a file icon and title.",
			"Dismiss X controls are hidden until a thumbnail is hovered.",
		],
	});

	await user.hover(
		screen
			.getByTestId("terminal-send-preview-qa-send-text")
			.closest('[data-slot="attachment"]') as HTMLElement,
	);
	expect(screen.getByTestId("terminal-send-dismiss-qa-send-text")).toBeTruthy();

	await captureDocument(document, {
		name: "treq-send-01a-hover-dismiss",
		expectations: [
			"Hovering the text attachment reveals its grey circular X dismiss control.",
			"The image attachment next to it still hides its X while not hovered.",
		],
	});

	await user.click(screen.getByTestId("terminal-send-dismiss-qa-send-text"));
	await waitFor(() => {
		expect(
			screen.queryByTestId("terminal-send-preview-qa-send-text"),
		).toBeNull();
	});

	await user.click(imageThumb);
	expect(await screen.findByTestId("treq-send-preview-lightbox")).toBeTruthy();
	expect(
		document.querySelector('[data-testid="treq-send-preview-lightbox"] img'),
	).toBeTruthy();
	expect(screen.getByTestId("treq-send-zoom-out")).toBeTruthy();
	expect(screen.getByTestId("treq-send-zoom-in")).toBeTruthy();
	expect(screen.getByTestId("treq-send-zoom-level").textContent).toBe("100%");
	expect(screen.getByTestId("treq-send-copy")).toBeTruthy();
	expect(screen.getByTestId("treq-send-reveal")).toBeTruthy();
	expect(screen.getByTestId("treq-send-close")).toBeTruthy();
	expect(screen.queryByTestId("treq-send-preview-modal")).toBeNull();

	await captureDocument(document, {
		name: "treq-send-03-image-lightbox",
		expectations: [
			"A blurred backdrop covers the app with no modal chrome around the asset.",
			"The blue SVG image is shown large in the center.",
			"Top-right toolbar includes zoom out, 100%, zoom in, plus copy, reveal, and close.",
		],
	});

	await user.click(screen.getByTestId("treq-send-zoom-in"));
	await user.click(screen.getByTestId("treq-send-zoom-in"));
	await user.click(screen.getByTestId("treq-send-zoom-in"));
	await user.click(screen.getByTestId("treq-send-zoom-in"));
	expect(screen.getByTestId("treq-send-zoom-level").textContent).toBe("200%");

	await captureDocument(document, {
		name: "treq-send-03b-image-zoomed",
		expectations: [
			"The SVG preview is physically larger than at 100% (layout width grew, not just transform).",
			"The zoom level label in the top-right toolbar reads 200%.",
		],
	});

	await user.click(screen.getByTestId("treq-send-close"));
	await waitFor(() => {
		expect(screen.queryByTestId("treq-send-preview-lightbox")).toBeNull();
	});

	await user.click(screen.getByTestId("terminal-send-dismiss-qa-send-image"));
	await waitFor(() => {
		expect(
			screen.queryByTestId("terminal-send-preview-qa-send-image"),
		).toBeNull();
	});

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
	await user.click(
		await screen.findByTestId("terminal-send-preview-qa-send-text-2"),
	);
	expect(await screen.findByTestId("treq-send-preview-lightbox")).toBeTruthy();
	await waitFor(() => {
		expect(
			screen.getByText(/Selectable preview text from treq send/),
		).toBeTruthy();
	});
	expect(
		screen.getByTestId("treq-send-preview-lightbox").textContent,
	).toContain("preview-note.txt");
	expect(screen.queryByTestId("treq-send-zoom-in")).toBeNull();

	await captureDocument(document, {
		name: "treq-send-02-text-lightbox",
		expectations: [
			"A blurred backdrop shows the text asset alone without a modal frame.",
			"The selectable text includes 'Selectable preview text from treq send'.",
			"Top-right shows copy, reveal, and close — no zoom controls for text.",
		],
	});
}, 60000);
