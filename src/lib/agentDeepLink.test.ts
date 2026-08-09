import { describe, expect, it } from "vitest";
import {
  findWorkspaceByBranch,
  isProcessedAgentRequest,
  markProcessedAgentRequest,
  parseAgentDeepLinkUrl,
  popPendingAgentRequests,
  queuePendingAgentRequest,
  tryClaimAgentRequest,
} from "./agentDeepLink";
import type { Workspace } from "./api";

describe("agent deep-link helpers", () => {
  it("parses valid agent deep link", () => {
    const parsed = parseAgentDeepLinkUrl(
      "treq://agent/start?repo=%2Ftmp%2Frepo&branch=feat%2Fone&prompt=hello&mode=edit&agent=codex&request_id=req-1",
    );
    expect(parsed).toEqual({
      repo: "/tmp/repo",
      branch: "feat/one",
      prompt: "hello",
      mode: "acceptEdits",
      agent: "codex",
      requestId: "req-1",
    });
  });

  it("rejects malformed deep link payload", () => {
    expect(parseAgentDeepLinkUrl("treq://auth/callback?token=abc")).toBeNull();
    expect(
      parseAgentDeepLinkUrl(
        "treq://agent/start?repo=a&branch=b&prompt=c&mode=bad&agent=codex&request_id=1",
      ),
    ).toBeNull();
  });

  it("tracks processed request ids", () => {
    expect(isProcessedAgentRequest("req-processed")).toBe(false);
    markProcessedAgentRequest("req-processed");
    expect(isProcessedAgentRequest("req-processed")).toBe(true);
  });

  it("allows only the first claim for a request id", () => {
    expect(tryClaimAgentRequest("req-claim")).toBe(true);
    expect(tryClaimAgentRequest("req-claim")).toBe(false);
  });

  it("queues and pops pending requests per repo without duplication", () => {
    const request = {
      repo: "/repo",
      branch: "feat/a",
      prompt: "do thing",
      mode: "plan" as const,
      agent: "claude" as const,
      requestId: "req-queue",
    };
    queuePendingAgentRequest(request);
    queuePendingAgentRequest(request);
    const popped = popPendingAgentRequests("/repo");
    expect(popped).toEqual([request]);
    expect(popPendingAgentRequests("/repo")).toEqual([]);
  });

  it("finds workspace by branch", () => {
    const workspaces = [
      { id: 1, branch_name: "main" },
      { id: 2, branch_name: "feat/x" },
    ] as Workspace[];
    expect(findWorkspaceByBranch(workspaces, "feat/x")?.id).toBe(2);
    expect(findWorkspaceByBranch(workspaces, "missing")).toBeNull();
  });
});
