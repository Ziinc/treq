/**
 * Consume PTY echo of bytes the user just wrote so process activity is not
 * inferred from local echo of keystrokes.
 *
 * Returns leftover pending echo and the unmatched suffix of `chunk`, which is
 * treated as process-produced output.
 */
export function consumePtyEcho(
  pendingEcho: string,
  chunk: string,
): { pendingEcho: string; processOutput: string } {
  if (!pendingEcho || !chunk) {
    return { pendingEcho, processOutput: chunk };
  }

  let echoIndex = 0;
  let chunkIndex = 0;

  while (echoIndex < pendingEcho.length && chunkIndex < chunk.length) {
    const echoChar = pendingEcho[echoIndex];
    const chunkChar = chunk[chunkIndex];

    if (
      echoChar === "\r" &&
      chunkChar === "\r" &&
      chunk[chunkIndex + 1] === "\n"
    ) {
      echoIndex += 1;
      chunkIndex += 2;
      continue;
    }
    if (echoChar === "\r" && chunkChar === "\n") {
      echoIndex += 1;
      chunkIndex += 1;
      continue;
    }

    if (echoChar === chunkChar) {
      echoIndex += 1;
      chunkIndex += 1;
      continue;
    }

    break;
  }

  return {
    pendingEcho: pendingEcho.slice(echoIndex),
    processOutput: chunk.slice(chunkIndex),
  };
}
