import type { DragEvent } from "react";
import {
  canAcceptTerminalDrop,
  terminalInsertTextFromDrop,
} from "../../lib/send-asset-drag";

export function handleTerminalDragOver(event: DragEvent): void {
  if (!canAcceptTerminalDrop(event.dataTransfer)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
}

export function handleTerminalDrop(
  event: DragEvent,
  options: { isPtyReady: boolean; write: (text: string) => void },
): void {
  const text = terminalInsertTextFromDrop(event.dataTransfer);
  if (!text) return;
  event.preventDefault();
  if (options.isPtyReady) {
    options.write(text);
  }
}

export function handleTerminalPaste(
  event: ClipboardEvent,
  options: {
    isPtyReady: boolean;
    write: (text: string) => void;
    writeInlineImage: (escapeSeq: string) => void;
  },
): void {
  const insert = event.clipboardData
    ? terminalInsertTextFromDrop(event.clipboardData)
    : null;
  if (insert) {
    event.preventDefault();
    if (options.isPtyReady) {
      options.write(insert);
    }
    return;
  }

  const items = event.clipboardData?.items;
  if (!items) return;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.type.startsWith("image/")) continue;
    event.preventDefault();
    const blob = item.getAsFile();
    if (!blob) continue;

    const reader = new FileReader();
    reader.onload = () => {
      const [, base64] = (reader.result as string).split(",");
      // iTerm2 inline image protocol: OSC 1337 ; File=inline=1:BASE64 BEL
      options.writeInlineImage(`\x1b]1337;File=inline=1:${base64}\x07`);
    };
    reader.readAsDataURL(blob);
    return;
  }
}
