import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { render, waitFor } from "../test-utils";
import { Dashboard } from "../../src/components/Dashboard";
import { createTestRepo, openRepo } from "../utils";
import { createWorkspace, getSessions } from "../../src/lib/api";

describe("agent deep-link integration", () => {
	beforeEach(() => {
		localStorage.clear();
		vi.clearAllMocks();
	});

	it("creates a workspace agent session from treq://agent/start and ignores duplicate request_id", async () => {
		const { repoPath } = createTestRepo(false);
		openRepo(repoPath);
		const workspaceId = await createWorkspace(repoPath, "feat/agent-link");

		render(<Dashboard />);

		const listenMock = vi.mocked(listen);
		const deepLinkCall = listenMock.mock.calls.find(
			(args) => args[0] === "deep-link-received",
		);
		expect(deepLinkCall).toBeTruthy();
		const callback = deepLinkCall?.[1] as (event: { payload: string[] }) => void;
		const url = `treq://agent/start?repo=${encodeURIComponent(
			repoPath,
		)}&branch=feat%2Fagent-link&prompt=${encodeURIComponent(
			"Investigate regression",
		)}&mode=edit&agent=codex&request_id=req-link-1`;

		await callback({ payload: [url] });
		await waitFor(async () => {
			const sessions = await getSessions(repoPath);
			expect(sessions.some((s) => s.workspace_id === workspaceId)).toBe(true);
		});
		const sessionCountAfterFirst = (await getSessions(repoPath)).length;

		await callback({ payload: [url] });
		await waitFor(async () => {
			const sessions = await getSessions(repoPath);
			expect(sessions.length).toBe(sessionCountAfterFirst);
		});
	});

	it("opens a new window for links targeting another repo", async () => {
		const { repoPath } = createTestRepo(false);
		const { repoPath: otherRepoPath } = createTestRepo(false);
		openRepo(repoPath);
		render(<Dashboard />);

		const listenMock = vi.mocked(listen);
		const deepLinkCall = listenMock.mock.calls.find(
			(args) => args[0] === "deep-link-received",
		);
		expect(deepLinkCall).toBeTruthy();
		const callback = deepLinkCall?.[1] as (event: { payload: string[] }) => void;
		const url = `treq://agent/start?repo=${encodeURIComponent(
			otherRepoPath,
		)}&branch=feat%2Fmissing&prompt=hello&mode=plan&agent=claude&request_id=req-link-2`;
		await callback({ payload: [url] });

		expect(WebviewWindow).toHaveBeenCalled();
	});
});
