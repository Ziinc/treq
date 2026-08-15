import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ParsedFileChange } from "../../../lib/git-utils";
import { useFileStaging } from "./useFileStaging";

function file(path: string): ParsedFileChange {
  return {
    path,
    workspaceStatus: "M",
    isConflicted: false,
  };
}

function clickEvent(
  overrides: Partial<
    Pick<React.MouseEvent, "metaKey" | "ctrlKey" | "shiftKey">
  > = {},
): React.MouseEvent {
  return {
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    ...overrides,
  } as React.MouseEvent;
}

function fileSectionId(path: string) {
  return `file-section-${path.replace(/[^a-zA-Z0-9]/g, "-")}`;
}

describe("useFileStaging sidebar scroll", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("scrolls to the file collapsible when clicking a Changes file", async () => {
    const path = "src/local.ts";
    const el = document.createElement("div");
    el.id = fileSectionId(path);
    document.body.appendChild(el);
    const spy = vi.spyOn(el, "scrollIntoView");

    const { result } = renderHook(() =>
      useFileStaging({
        files: [file(path)],
        diffContainerRef: { current: document.createElement("div") },
      }),
    );

    act(() => {
      result.current.handleFileSelect(path, clickEvent());
    });

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    });
  });

  it("scrolls again when clicking an already selected Changes file", async () => {
    const path = "src/local.ts";
    const el = document.createElement("div");
    el.id = fileSectionId(path);
    document.body.appendChild(el);
    const spy = vi.spyOn(el, "scrollIntoView");

    const { result } = renderHook(() =>
      useFileStaging({
        files: [file(path)],
        diffContainerRef: { current: document.createElement("div") },
      }),
    );

    act(() => {
      result.current.handleFileSelect(path, clickEvent());
    });
    await waitFor(() => expect(spy).toHaveBeenCalled());
    spy.mockClear();

    act(() => {
      result.current.handleFileSelect(path, clickEvent());
    });
    await waitFor(() => expect(spy).toHaveBeenCalled());
  });

  it("scrolls to the file collapsible when clicking a Selected file", async () => {
    const path = "src/staged.ts";
    const el = document.createElement("div");
    el.id = fileSectionId(path);
    document.body.appendChild(el);
    const spy = vi.spyOn(el, "scrollIntoView");

    const { result } = renderHook(() =>
      useFileStaging({
        files: [file(path)],
        diffContainerRef: { current: document.createElement("div") },
      }),
    );

    act(() => {
      result.current.handleStageFile(path);
    });
    act(() => {
      result.current.handleStagedFileSelect(path, clickEvent());
    });

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    });
  });

  it("scrolls again when clicking an already selected Selected file", async () => {
    const path = "src/staged.ts";
    const el = document.createElement("div");
    el.id = fileSectionId(path);
    document.body.appendChild(el);
    const spy = vi.spyOn(el, "scrollIntoView");

    const { result } = renderHook(() =>
      useFileStaging({
        files: [file(path)],
        diffContainerRef: { current: document.createElement("div") },
      }),
    );

    act(() => {
      result.current.handleStageFile(path);
    });
    act(() => {
      result.current.handleStagedFileSelect(path, clickEvent());
    });
    await waitFor(() => expect(spy).toHaveBeenCalled());
    spy.mockClear();

    act(() => {
      result.current.handleStagedFileSelect(path, clickEvent());
    });
    await waitFor(() => expect(spy).toHaveBeenCalled());
  });
});
