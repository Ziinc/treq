import { shellQuote } from "./shellQuote";

/** MIME type for dragging a treq-send asset onto a terminal. */
export const SEND_ASSET_MIME = "application/x-treq-send-asset";

export interface SendAssetDragPayload {
  path: string;
  title: string;
}

export function setSendAssetDragData(
  dataTransfer: DataTransfer,
  payload: SendAssetDragPayload,
): void {
  const serialized = JSON.stringify(payload);
  dataTransfer.setData(SEND_ASSET_MIME, serialized);
  dataTransfer.setData("text/plain", shellQuote(payload.path));
  dataTransfer.effectAllowed = "copy";
}

export function getSendAssetDragData(
  dataTransfer: DataTransfer,
): SendAssetDragPayload | null {
  const raw = dataTransfer.getData(SEND_ASSET_MIME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SendAssetDragPayload;
    if (
      !parsed ||
      typeof parsed.path !== "string" ||
      !parsed.path ||
      typeof parsed.title !== "string"
    ) {
      return null;
    }
    return { path: parsed.path, title: parsed.title };
  } catch {
    return null;
  }
}

export function isSendAssetDrag(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes(SEND_ASSET_MIME);
}

/** Whether a drag-over should be accepted as a terminal insert. */
export function canAcceptTerminalDrop(dataTransfer: DataTransfer): boolean {
  const types = Array.from(dataTransfer.types);
  return types.includes(SEND_ASSET_MIME) || types.includes("Files");
}

/** Text to insert into a PTY when dropping files or a send asset. */
export function terminalInsertTextFromDrop(
  dataTransfer: DataTransfer,
): string | null {
  const asset = getSendAssetDragData(dataTransfer);
  if (asset) {
    return shellQuote(asset.path);
  }

  const files = Array.from(dataTransfer.files);
  if (files.length > 0) {
    const paths = files
      .map((file) => (file as File & { path?: string }).path)
      .filter((path): path is string => typeof path === "string" && path !== "")
      .map(shellQuote);
    if (paths.length > 0) {
      return paths.join(" ");
    }
  }

  return null;
}
