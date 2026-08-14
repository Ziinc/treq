import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useTerminalSessionSummaries } from "./useTerminalSessionSummaries";
import type { TerminalEntry } from "./types";

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
    expect(latest[0].previewOutput).not.toMatch(/\x1b/);
    expect(latest[0].isStreaming).toBe(true);
  });
});
