import type { Terminal as XTerm } from "@xterm/xterm";

/** Printable snapshot of the active xterm buffer. */
export function readXtermScreen(xterm: XTerm | null | undefined): string {
  if (!xterm) return "";
  const buffer = xterm.buffer.active;
  const lines: string[] = [];
  for (let i = 0; i < buffer.length; i++) {
    lines.push(buffer.getLine(i)?.translateToString(true) ?? "");
  }
  return lines.join("\n").replace(/\n+$/, "");
}
