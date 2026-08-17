import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useTerminalSessionSummaries } from "./useTerminalSessionSummaries";
import type { TerminalEntry } from "./types";
import { REFRESH_WORKSPACE_CHANGES_EVENT } from "../../lib/change-file-drag";

describe("useTerminalSessionSummaries preview output", () => {
  it("stores a formatted preview when terminal output arrives", () => {
    const onTerminalsChange = vi.fn();
    const allTerminals: TerminalEntry[] = [
      { type: "shell", data: { id: "shell-1", workingDirectory: "/tmp/ws" } },
    ];

    const { result } = renderHook(() =>
      useTerminalSessionSummaries({
        allTerminals,
        workspaceBranchByPath: new Map([["/tmp/ws", "feat/demo"]]),
        onTerminalsChange,
      }),
    );

    act(() => {
      result.current.handleTerminalOutput(
        "shell-1",
        "\x1b[32m$ \x1b[0mecho hi\r\nhi\r\n",
      );
    });

    expect(onTerminalsChange).toHaveBeenCalled();
    const latest = onTerminalsChange.mock.calls.at(-1)?.[0] as Array<{
      id: string;
      previewOutput: string;
      isStreaming: boolean;
    }>;
    expect(latest[0].previewOutput).toContain("echo hi");
    expect(latest[0].previewOutput).toContain("hi");
    expect(latest[0].previewOutput).not.toContain("\x1b");
    expect(latest[0].isStreaming).toBe(true);
  });

  it("does not refresh lastActivityAt when output is local echo of user input", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const onTerminalsChange = vi.fn();
    const allTerminals: TerminalEntry[] = [
      { type: "shell", data: { id: "shell-1", workingDirectory: "/tmp/ws" } },
    ];

    const { result } = renderHook(() =>
      useTerminalSessionSummaries({
        allTerminals,
        onTerminalsChange,
      }),
    );

    act(() => {
      result.current.handleTerminalInput("shell-1");
    });
    const afterInput = onTerminalsChange.mock.calls.at(-1)?.[0] as Array<{
      lastActivityAt: number;
      lastUserInputAt: number;
      isStreaming: boolean;
    }>;
    const activityAt = afterInput[0].lastActivityAt;

    vi.setSystemTime(1_500);
    act(() => {
      result.current.handleTerminalOutput("shell-1", "ls", false);
    });

    const afterEcho = onTerminalsChange.mock.calls.at(-1)?.[0] as Array<{
      lastActivityAt: number;
      lastUserInputAt: number;
      isStreaming: boolean;
      previewOutput: string;
    }>;
    expect(afterEcho[0].lastActivityAt).toBe(activityAt);
    expect(afterEcho[0].isStreaming).toBe(false);
    expect(afterEcho[0].lastUserInputAt).toBeGreaterThan(0);

    vi.useRealTimers();
  });

  it("does not dispatch a filesystem refresh when a streaming terminal goes idle", () => {
    const onRefresh = vi.fn();
    window.addEventListener(REFRESH_WORKSPACE_CHANGES_EVENT, onRefresh);

    const allTerminals: TerminalEntry[] = [
      { type: "shell", data: { id: "shell-1", workingDirectory: "/tmp/ws" } },
    ];
    const onTerminalsChange = vi.fn();
    const { result } = renderHook(() =>
      useTerminalSessionSummaries({ allTerminals, onTerminalsChange }),
    );

    act(() => {
      result.current.handleTerminalOutput("shell-1", "agent wrote files\n");
    });
    act(() => {
      result.current.handleTerminalIdlePulse("shell-1");
    });

    expect(onRefresh).not.toHaveBeenCalled();
    const latest = onTerminalsChange.mock.calls.at(-1)?.[0] as Array<{
      isStreaming: boolean;
    }>;
    expect(latest[0].isStreaming).toBe(false);

    window.removeEventListener(REFRESH_WORKSPACE_CHANGES_EVENT, onRefresh);
  });
});
