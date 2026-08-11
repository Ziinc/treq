import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TerminalSessionsSidebar } from "./TerminalSessionsSidebar";
import type { TerminalSessionSummary } from "./terminal/types";
import { TooltipProvider } from "./ui/tooltip";

const session = (
  id: string,
  lastActivityAt: number,
): TerminalSessionSummary => ({
  id,
  kind: "shell",
  name: id,
  branchName: "main",
  isMainRepo: true,
  lastActivityAt,
  lastUserInputAt: 0,
  isStreaming: false,
});

describe("TerminalSessionsSidebar reorder animation", () => {
  let positions: Record<string, number>;
  let frames: FrameRequestCallback[];

  beforeEach(() => {
    positions = { first: 0, second: 30 };
    frames = [];
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        const top = positions[this.dataset.flipId ?? ""] ?? 0;
        return { top } as DOMRect;
      },
    );
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
  });

  it("uses a short, subtle, non-bouncing transition when sessions reorder", () => {
    const { rerender, getByTestId } = render(
      <TooltipProvider>
        <TerminalSessionsSidebar
          sessions={[session("first", 2), session("second", 1)]}
        />
      </TooltipProvider>,
    );

    positions = { first: 30, second: 0 };
    rerender(
      <TooltipProvider>
        <TerminalSessionsSidebar
          sessions={[session("first", 1), session("second", 2)]}
        />
      </TooltipProvider>,
    );

    expect(getByTestId("terminal-session-item-first").style.transform).toBe(
      "translateY(-8px)",
    );

    act(() => frames.splice(0).forEach((frame) => frame(0)));

    expect(getByTestId("terminal-session-item-first").style.transition).toBe(
      "transform 180ms cubic-bezier(0.2, 0, 0, 1)",
    );
    expect(getByTestId("terminal-session-item-first").style.transform).toBe("");
  });

  it("shows the streaming spinner before the session name", () => {
    const streaming = { ...session("working", 1), isStreaming: true };
    const { getByLabelText, getByText } = render(
      <TooltipProvider>
        <TerminalSessionsSidebar sessions={[streaming]} />
      </TooltipProvider>,
    );

    expect(
      getByLabelText("Active changes").compareDocumentPosition(
        getByText("working"),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("sorts sessions by their most recent user input instead of output", () => {
    const recentOutput = session("recent-output", 300);
    const recentInput = {
      ...session("recent-input", 100),
      lastUserInputAt: 200,
    };
    const olderInput = {
      ...session("older-input", 400),
      lastUserInputAt: 150,
    };

    const { getAllByTestId } = render(
      <TooltipProvider>
        <TerminalSessionsSidebar
          sessions={[recentOutput, olderInput, recentInput]}
        />
      </TooltipProvider>,
    );

    expect(
      getAllByTestId(/terminal-session-item-/).map(
        (item) => item.dataset.flipId,
      ),
    ).toEqual(["recent-input", "older-input", "recent-output"]);
  });
});
