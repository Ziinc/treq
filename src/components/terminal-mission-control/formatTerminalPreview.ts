/**
 * Turn raw PTY scrollback into a short plain-text preview for Mission Control
 * cards. Strips ANSI/CSI sequences and keeps only the newest printable lines.
 */
export function formatTerminalPreview(
  rawOutput: string,
  options: { maxLines?: number; maxChars?: number } = {},
): string {
  const maxLines = options.maxLines ?? 8;
  const maxChars = options.maxChars ?? 400;

  // CSI / OSC / single-char ESC sequences commonly emitted by shells and TUI apps.
  const withoutAnsi = rawOutput
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[^\n]*\r/g, "");

  const lines = withoutAnsi
    .split("\n")
    .map((line) => line.replace(/\s+$/g, ""))
    .filter((line, index, all) => {
      // Drop trailing blank lines; keep interior blanks for spacing.
      if (line.length > 0) return true;
      return (
        index < all.length - 1 && all.slice(index + 1).some((l) => l.length > 0)
      );
    });

  const newest = lines.slice(-maxLines).join("\n");
  if (newest.length <= maxChars) return newest;
  return newest.slice(newest.length - maxChars).replace(/^\S*\s/, "");
}
