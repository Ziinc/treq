import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import userEvent from "@testing-library/user-event";
import { listen } from "@tauri-apps/api/event";
import { render, screen, waitFor } from "@testing-library/react";
import { TerminalSendPreviews } from "./TerminalSendPreviews";
import { TreqSendProvider, useTreqSend } from "../../hooks/useTreqSend";
import { TREQ_SEND_EVENT } from "../../lib/treqSend";
import * as api from "../../lib/api";
import * as treqSend from "../../lib/treqSend";

vi.spyOn(api, "readFile").mockResolvedValue("hello from send");
vi.spyOn(treqSend, "treqSendFileSrc").mockImplementation(
	(path: string) => `asset://localhost${path}`,
);

function SendHarness({
	ptySessionId,
	isActive = true,
}: {
	ptySessionId: string;
	isActive?: boolean;
}) {
	const { ingestPayload } = useTreqSend();
	return (
		<div>
			<button
				type="button"
				onClick={() =>
					ingestPayload({
						kind: "send",
						request_id: "send-1",
						repo: "/tmp/repo",
						pty_session_id: ptySessionId,
						media_type: "text",
						path: "/tmp/repo/.treq/send/note.txt",
						title: "note.txt",
					})
				}
			>
				Inject text
			</button>
			<button
				type="button"
				onClick={() =>
					ingestPayload({
						kind: "send",
						request_id: "send-2",
						repo: "/tmp/repo",
						pty_session_id: ptySessionId,
						media_type: "image",
						path: "/tmp/repo/shot.png",
						title: "shot.png",
					})
				}
			>
				Inject image
			</button>
			<TerminalSendPreviews ptySessionId={ptySessionId} isActive={isActive} />
		</div>
	);
}

function renderSend(ui: ReactElement) {
	return render(<TreqSendProvider>{ui}</TreqSendProvider>);
}

describe("TerminalSendPreviews", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(api.readFile).mockResolvedValue("hello from send");
		vi.mocked(treqSend.treqSendFileSrc).mockImplementation(
			(path: string) => `asset://localhost${path}`,
		);
	});

	it("shows square previews and opens a selectable text modal on click", async () => {
		const user = userEvent.setup();
		renderSend(<SendHarness ptySessionId="session-1" />);

		await user.click(screen.getByRole("button", { name: "Inject text" }));
		expect(await screen.findByTestId("terminal-send-previews")).toBeTruthy();
		const thumb = await screen.findByTestId("terminal-send-preview-send-1");
		await user.click(thumb);

		expect(await screen.findByTestId("treq-send-preview-modal")).toBeTruthy();
		await waitFor(() => {
			expect(screen.getByTestId("treq-send-text-preview").textContent).toBe(
				"hello from send",
			);
		});
		expect(api.readFile).toHaveBeenCalledWith(
			"/tmp/repo/.treq/send/note.txt",
		);
	});

	it("renders image thumbnails with asset URLs", async () => {
		const user = userEvent.setup();
		renderSend(<SendHarness ptySessionId="session-1" />);
		await user.click(screen.getByRole("button", { name: "Inject image" }));
		const thumb = await screen.findByTestId("terminal-send-preview-send-2");
		const img = thumb.querySelector("img");
		expect(img?.getAttribute("src")).toBe(
			"asset://localhost/tmp/repo/shot.png",
		);
	});

	it("listens for treq-send-received events", async () => {
		renderSend(<SendHarness ptySessionId="session-listen" />);
		await waitFor(() => {
			expect(
				vi
					.mocked(listen)
					.mock.calls.some((args) => args[0] === TREQ_SEND_EVENT),
			).toBe(true);
		});
	});
});
