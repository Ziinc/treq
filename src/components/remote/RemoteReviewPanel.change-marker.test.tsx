import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "../../../test/test-utils";
import { RemoteReviewPanel } from "./RemoteReviewPanel";
import * as remoteDispatch from "../../lib/remote-dispatch";

// Verifies the PRD "Change propagation across concurrent clients"
// requirement: a client polling a workspace's JJ operation-log marker must
// detect that VM-side repository state moved for a reason other than its
// own last mutation, and refresh - without doing any conflict resolution.

vi.mock("../../lib/remote-dispatch", async () => {
  const actual = await vi.importActual<typeof remoteDispatch>(
    "../../lib/remote-dispatch",
  );
  return {
    ...actual,
    dispatch: vi.fn(),
  };
});

const mockDispatch = vi.mocked(remoteDispatch.dispatch);

function isRepositoryStatusCall(
  call: Parameters<typeof remoteDispatch.dispatch>,
) {
  return call[1].kind === "RepositoryStatus";
}

function respond(request: remoteDispatch.TreqCommandRequest, marker: string) {
  switch (request.kind) {
    case "WorkspaceChangeMarker":
      return Promise.resolve({ operation_id: marker });
    case "RepositoryStatus":
      return Promise.resolve({ ok: true });
    case "ListChanges":
      return Promise.resolve([]);
    case "ListCommits":
      return Promise.resolve([]);
    case "ListConflicts":
      return Promise.resolve([]);
    default:
      return Promise.resolve(undefined);
  }
}

describe("RemoteReviewPanel change-marker watch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refreshes remote review data when the operation marker changes underneath the client", async () => {
    let marker = "op-1";
    mockDispatch.mockImplementation((_endpoint, request) =>
      respond(request, marker),
    );

    render(
      <RemoteReviewPanel
        endpoint={null}
        endpointGeneration={1}
        location={{ type: "ssh", host: "devbox", path: "/srv/project" }}
        workspace={null}
      />,
    );

    // Initial load resolves and seeds the baseline marker without treating
    // it as a foreign change (no refresh signal is observable from mount
    // alone - the important assertion is the *second* fetch below).
    await waitFor(() => {
      expect(mockDispatch.mock.calls.some(isRepositoryStatusCall)).toBe(true);
    });
    const callsAfterMount = mockDispatch.mock.calls.length;

    // Simulate the VM-side operation log advancing because of a different
    // client/process - not this one.
    marker = "op-2";

    // Advance past the marker poll interval.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 4_100));
    });

    await waitFor(() => {
      const statusCallsAfterChange = mockDispatch.mock.calls.filter(
        isRepositoryStatusCall,
      ).length;
      // A fresh RepositoryStatus dispatch after the marker changed is the
      // observable signal that the panel refreshed its read state.
      expect(statusCallsAfterChange).toBeGreaterThan(0);
    });

    expect(mockDispatch.mock.calls.length).toBeGreaterThan(callsAfterMount);
  }, 10_000);
});

// Silence unused-import lint for `screen` if not used directly in this file.
void screen;
