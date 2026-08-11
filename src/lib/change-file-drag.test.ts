import { describe, expect, it } from "vitest";
import {
  CHANGE_FILES_MIME,
  getChangeFilesDragData,
  isChangeFilesDrag,
  setChangeFilesDragData,
} from "./change-file-drag";

function mockDataTransfer(initialTypes: string[] = []): DataTransfer {
  const store = new Map<string, string>();
  const types = [...initialTypes];
  return {
    dropEffect: "none",
    effectAllowed: "all",
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types,
    clearData: () => store.clear(),
    getData: (format: string) => store.get(format) ?? "",
    setData: (format: string, data: string) => {
      store.set(format, data);
      if (!types.includes(format)) types.push(format);
    },
    setDragImage: () => {},
  } as DataTransfer;
}

describe("change-file-drag", () => {
  it("round-trips payload through dataTransfer", () => {
    const dt = mockDataTransfer();
    setChangeFilesDragData(dt, {
      files: ["a.txt", "b.txt"],
      sourceBranch: "feat/x",
    });
    expect(isChangeFilesDrag(dt)).toBe(true);
    expect(getChangeFilesDragData(dt)).toEqual({
      files: ["a.txt", "b.txt"],
      sourceBranch: "feat/x",
    });
    expect(dt.getData(CHANGE_FILES_MIME)).toContain("feat/x");
  });

  it("returns null for empty or invalid payloads", () => {
    const dt = mockDataTransfer();
    expect(getChangeFilesDragData(dt)).toBeNull();
    dt.setData("text/plain", "not-json");
    expect(getChangeFilesDragData(dt)).toBeNull();
    dt.setData(
      CHANGE_FILES_MIME,
      JSON.stringify({ files: [], sourceBranch: "x" }),
    );
    expect(getChangeFilesDragData(dt)).toBeNull();
  });
});
