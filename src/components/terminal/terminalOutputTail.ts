export const MAX_TERMINAL_TAIL_CHARS = 32 * 1024;

export interface TerminalOutputTail {
  raw: string;
}

export function createTerminalOutputTail(): TerminalOutputTail {
  return { raw: "" };
}

export function appendTerminalOutput(
  tail: TerminalOutputTail,
  chunk: string,
): TerminalOutputTail {
  const combined = tail.raw + chunk;
  if (combined.length <= MAX_TERMINAL_TAIL_CHARS) {
    return { raw: combined };
  }
  return { raw: combined.slice(-MAX_TERMINAL_TAIL_CHARS) };
}

export function terminalQuestionWindow(tail: TerminalOutputTail): string {
  return tail.raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .slice(-15)
    .join("\n");
}
