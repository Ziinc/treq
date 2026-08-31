import { describe, expect, it, vi } from "vitest";
import { handleTerminalPaste } from "./handleTerminalClipboard";
import { SEND_ASSET_MIME } from "../../lib/send-asset-drag";

function mockClipboardEvent(data: {
  types?: string[];
  store?: Record<string, string>;
  files?: Array<{ path?: string }>;
  items?: DataTransferItem[];
}): ClipboardEvent {
  const store = data.store ?? {};
  const types = data.types ?? Object.keys(store);
  const clipboardData = {
    dropEffect: "none",
    effectAllowed: "all",
    files: (data.files ?? []) as unknown as FileList,
    items: (data.items ?? []) as unknown as DataTransferItemList,
    types,
    clearData: () => {},
    getData: (format: string) => store[format] ?? "",
    setData: () => {},
    setDragImage: () => {},
  } as DataTransfer;
  return {
    clipboardData,
    preventDefault: vi.fn(),
  } as unknown as ClipboardEvent;
}

describe("handleTerminalPaste", () => {
  it("inserts a quoted send-asset path and skips inline image handling", () => {
    const write = vi.fn();
    const writeInlineImage = vi.fn();
    const event = mockClipboardEvent({
      store: {
        [SEND_ASSET_MIME]: JSON.stringify({
          path: "/tmp/shot.png",
          title: "shot.png",
        }),
        "text/plain": "'/tmp/shot.png'",
      },
      items: [
        { type: "image/png", getAsFile: () => new Blob() },
      ] as unknown as DataTransferItem[],
    });

    handleTerminalPaste(event, {
      isPtyReady: true,
      write,
      writeInlineImage,
    });

    expect(event.preventDefault).toHaveBeenCalled();
    expect(write).toHaveBeenCalledWith("'/tmp/shot.png'");
    expect(writeInlineImage).not.toHaveBeenCalled();
  });
});
