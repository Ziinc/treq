import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { FileHunksData, LineMouseDownPayload } from "../types";
import { useLineSelection } from "./useLineSelection";

function hunksFor(
  filePath: string,
  lines: string[],
): Map<string, FileHunksData> {
  return new Map([
    [
      filePath,
      {
        filePath,
        isLoading: false,
        hunks: [
          {
            id: "h1",
            header: "@@ -1,3 +1,3 @@",
            lines,
            patch: "",
          },
        ],
      },
    ],
  ]);
}

function mouseDown(
  filePath: string,
  lineIndex: number,
  lineContent: string,
): LineMouseDownPayload {
  return {
    event: {
      button: 0,
      preventDefault() {},
      stopPropagation() {},
    } as LineMouseDownPayload["event"],
    filePath,
    hunkIndex: 0,
    lineIndex,
    lineContent,
    isStaged: false,
  };
}

describe("useLineSelection drag", () => {
  it("expands the range when mouseEnter runs in the same turn as mouseDown", () => {
    const filePath = "test.txt";
    const lines = ["+added line 2", "+added line 3", "+added line 4"];
    const { result } = renderHook(() =>
      useLineSelection({
        allFileHunks: hunksFor(filePath, lines),
        onClearFileSelections: () => {},
      }),
    );

    act(() => {
      result.current.handleLineMouseDown(mouseDown(filePath, 0, lines[0]));
      result.current.handleLineMouseEnter({
        filePath,
        hunkIndex: 0,
        lineIndex: 2,
      });
    });

    expect(
      result.current.diffLineSelection?.lines.map((l) => l.lineIndex),
    ).toEqual([0, 1, 2]);
  });

  it("keeps expanding after a new hunks Map identity between mouseDown and mouseEnter", () => {
    const filePath = "test.txt";
    const lines = ["+added line 2", "+added line 3", "+added line 4"];
    const { result, rerender } = renderHook(
      ({ hunks }) =>
        useLineSelection({
          allFileHunks: hunks,
          onClearFileSelections: () => {},
        }),
      { initialProps: { hunks: hunksFor(filePath, lines) } },
    );

    act(() => {
      result.current.handleLineMouseDown(mouseDown(filePath, 0, lines[0]));
    });
    rerender({ hunks: hunksFor(filePath, lines) });
    act(() => {
      result.current.handleLineMouseEnter({
        filePath,
        hunkIndex: 0,
        lineIndex: 2,
      });
    });

    expect(
      result.current.diffLineSelection?.lines.map((l) => l.lineIndex),
    ).toEqual([0, 1, 2]);
  });
});
