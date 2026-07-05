import { describe, expect, it, vi } from "vitest";
import { render, screen } from "./test-utils";
import { WorkspaceLogsTab } from "../src/components/WorkspaceLogsTab";

vi.mock("../src/lib/api", () => ({
	getWorkspaceLogs: vi.fn(),
}));

import { getWorkspaceLogs } from "../src/lib/api";

describe("WorkspaceLogsTab", () => {
	it("renders grouped session logs", async () => {
		vi.mocked(getWorkspaceLogs).mockResolvedValue([
			{
				session_id: "session-a",
				workspace_key: "/repo/workspace",
				workspace_id: 1,
				first_timestamp_ms: 10,
				last_timestamp_ms: 20,
				log_count: 2,
				entries: [
					{
						session_id: "session-a",
						workspace_key: "/repo/workspace",
						workspace_id: 1,
						timestamp_ms: 10,
						source: "pty",
						level: "info",
						message: "hello",
					},
					{
						session_id: "session-a",
						workspace_key: "/repo/workspace",
						workspace_id: 1,
						timestamp_ms: 20,
						source: "pty",
						level: "warn",
						message: "world",
					},
				],
			},
		]);

		render(
			<WorkspaceLogsTab
				repoPath="/repo"
				workspaceId={1}
				workspaceKey="/repo/workspace"
			/>,
		);

		expect(await screen.findByText("session-a")).toBeTruthy();
		expect(await screen.findByText("hello")).toBeTruthy();
		expect(await screen.findByText("world")).toBeTruthy();
	});

	it("renders empty state when no logs exist", async () => {
		vi.mocked(getWorkspaceLogs).mockResolvedValue([]);

		render(
			<WorkspaceLogsTab repoPath="/repo" workspaceId={1} workspaceKey={null} />,
		);

		expect(await screen.findByText("No logs found")).toBeTruthy();
	});
});
