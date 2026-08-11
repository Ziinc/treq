/**
 * Shared repo seed for README marketing screenshots (assets/screenshots/*.png).
 * Mirrors the docs-* screenshot pattern: real jj repo via NAPI, real Dashboard,
 * captureDocument with publishTo for the committed marketing assets.
 *
 * Avoid committing on the home repo before creating workspaces — that can leave
 * the default-branch bookmark conflicted, and Review then fails to resolve the
 * target revset (see JJ "Name … is conflicted" toast).
 */
import path from "node:path";
import {
  createCommit,
  createWorkspace,
  getWorkspaces,
} from "../../src/lib/api";
import {
  createTestRepo,
  openRepo,
  resolveWorkspacePath,
  writeWorkspaceFile,
} from "../../test/utils";

export const MARKETING_BRANCH = "feat/empty-event-message";
export const SIDEBAR_BRANCHES = [
  "feat/keyvalues-cache",
  "feat/alerting-logs",
  "feat/implement-tracing",
] as const;

const CLIENT_SRC = `export type EventBody = {
  event_message?: string;
  [key: string]: unknown;
};

export async function postEvent(body: EventBody): Promise<Response> {
  const message =
    typeof body.event_message === "string" && body.event_message.length > 0
      ? body.event_message
      : JSON.stringify(body);

  return fetch("/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, event_message: message }),
  });
}
`;

const CLIENT_TEST = `import { describe, expect, it, vi } from "vitest";
import { postEvent } from "./client";

describe("postEvent", () => {
  it("json stringifies body when event_message is absent", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await postEvent({ source: "discord", payload: { id: 1 } });

    expect(fetchMock).toHaveBeenCalledWith(
      "/events",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"event_message"'),
      }),
    );
  });
});
`;

export type MarketingFixture = {
  repoPath: string;
  workspace: { id: number; path: string; branch_name: string };
};

/**
 * Seed a multi-workspace repo with a committed feature change that looks good
 * on the Code / Review / Commits tabs. Callers render Dashboard and navigate.
 */
export async function seedReadmeMarketingRepo(): Promise<MarketingFixture> {
  const { repoPath } = createTestRepo(false);
  openRepo(repoPath);

  // Incidental sidebar density — create before any commits so every workspace
  // shares the same clean target bookmark.
  for (const branch of SIDEBAR_BRANCHES) {
    await createWorkspace(repoPath, branch);
  }

  const workspaceId = await createWorkspace(repoPath, MARKETING_BRANCH);
  const workspace = (await getWorkspaces(repoPath)).find(
    (candidate) => candidate.id === workspaceId,
  );
  if (!workspace) {
    throw new Error(`Expected ${MARKETING_BRANCH} workspace to exist`);
  }

  const workspacePath = resolveWorkspacePath(
    repoPath,
    workspace.workspace_path,
  );
  writeWorkspaceFile(workspacePath, "src/client.ts", CLIENT_SRC);
  await createCommit(
    repoPath,
    workspace.id,
    "feat: handle empty event messages",
  );
  writeWorkspaceFile(workspacePath, "src/client.test.ts", CLIENT_TEST);
  await createCommit(
    repoPath,
    workspace.id,
    "test: cover missing event_message",
  );

  return {
    repoPath,
    workspace: {
      id: workspace.id,
      path: workspace.workspace_path,
      branch_name: workspace.branch_name,
    },
  };
}

export const README_SCREENSHOTS_DIR = path.join("assets", "screenshots");
