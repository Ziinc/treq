import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SEND_ASSET_MIME,
  copySendAssetToClipboard,
  getSendAssetDragData,
  isSendAssetDrag,
  setSendAssetDragData,
  terminalInsertTextFromDrop,
  canAcceptTerminalDrop,
} from "./send-asset-drag";

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

describe("send-asset-drag", () => {
  it("round-trips payload and quotes the path as text/plain", () => {
    const dt = mockDataTransfer();
    setSendAssetDragData(dt, {
      path: "/tmp/repo/my shot.png",
      title: "my shot.png",
    });
    expect(isSendAssetDrag(dt)).toBe(true);
    expect(getSendAssetDragData(dt)).toEqual({
      path: "/tmp/repo/my shot.png",
      title: "my shot.png",
    });
    expect(dt.getData("text/plain")).toBe("'/tmp/repo/my shot.png'");
    expect(dt.getData(SEND_ASSET_MIME)).toContain("my shot.png");
  });

  it("returns null for missing or invalid payloads", () => {
    const dt = mockDataTransfer();
    expect(getSendAssetDragData(dt)).toBeNull();
    dt.setData(SEND_ASSET_MIME, "not-json");
    expect(getSendAssetDragData(dt)).toBeNull();
    dt.setData(SEND_ASSET_MIME, JSON.stringify({ path: "", title: "x" }));
    expect(getSendAssetDragData(dt)).toBeNull();
  });

  it("inserts a quoted asset path from a send-asset drop", () => {
    const dt = mockDataTransfer();
    setSendAssetDragData(dt, {
      path: "/tmp/note.txt",
      title: "note.txt",
    });
    expect(terminalInsertTextFromDrop(dt)).toBe("'/tmp/note.txt'");
  });

  it("inserts quoted OS file paths when no send-asset payload is present", () => {
    const dt = mockDataTransfer();
    Object.defineProperty(dt, "files", {
      value: [{ path: "/tmp/a file.txt" }, { path: "/tmp/b.txt" }],
    });
    expect(terminalInsertTextFromDrop(dt)).toBe(
      "'/tmp/a file.txt' '/tmp/b.txt'",
    );
  });

  it("ignores unrelated text/plain drops", () => {
    const dt = mockDataTransfer();
    dt.setData("text/plain", '{"files":["x"]}');
    expect(terminalInsertTextFromDrop(dt)).toBeNull();
  });
});

describe("canAcceptTerminalDrop", () => {
  it("accepts send-asset and Files drags", () => {
    const asset = mockDataTransfer();
    setSendAssetDragData(asset, { path: "/tmp/a", title: "a" });
    expect(canAcceptTerminalDrop(asset)).toBe(true);

    const files = mockDataTransfer(["Files"]);
    expect(canAcceptTerminalDrop(files)).toBe(true);

    const other = mockDataTransfer(["text/plain"]);
    expect(canAcceptTerminalDrop(other)).toBe(false);
  });
});

describe("copySendAssetToClipboard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("writes the quoted path and send-asset MIME via ClipboardItem", async () => {
    let captured: Record<string, Blob> | undefined;
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal(
      "ClipboardItem",
      class ClipboardItem {
        constructor(items: Record<string, Blob>) {
          captured = items;
        }
      },
    );
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { write, writeText: vi.fn() },
    });

    await copySendAssetToClipboard({
      path: "/tmp/my file.txt",
      title: "my file.txt",
    });

    expect(write).toHaveBeenCalledTimes(1);
    expect(captured).toBeTruthy();
    expect(Object.keys(captured!)).toEqual(
      expect.arrayContaining(["text/plain", SEND_ASSET_MIME]),
    );
    expect(captured!["text/plain"]).toBeInstanceOf(Blob);
    expect(captured![SEND_ASSET_MIME]).toBeInstanceOf(Blob);
  });

  it("falls back to writeText when ClipboardItem write fails", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal(
      "ClipboardItem",
      class ClipboardItem {
        constructor() {}
      },
    );
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        write: vi.fn().mockRejectedValue(new Error("unsupported type")),
        writeText,
      },
    });

    await copySendAssetToClipboard({
      path: "/tmp/note.txt",
      title: "note.txt",
    });
    expect(writeText).toHaveBeenCalledWith("'/tmp/note.txt'");
  });
});
