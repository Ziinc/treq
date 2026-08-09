import {
  attachConsole,
  debug,
  error,
  info,
  trace,
  warn,
} from "@tauri-apps/plugin-log";

/**
 * Initialize logging - attaches console to receive Rust logs in browser devtools
 * and forwards console.* calls to the Tauri log plugin.
 */
export async function initLogger(): Promise<() => void> {
  // Attach console to receive Rust logs in browser devtools
  const detach = await attachConsole();

  // Forward console methods to Tauri log plugin (uses target "webview" — see
  // tauri `level_for("webview", ...)`). `log` must map to `info` (not `trace`)
  // or default log filters will hide it in the terminal.
  forwardConsole("log", info);
  // // forwardConsole("debug", debug);
  forwardConsole("info", info);
  forwardConsole("warn", warn);
  forwardConsole("error", error);

  return detach;
}

function forwardConsole(
  fnName: "log" | "debug" | "info" | "warn" | "error",
  logger: (message: string) => Promise<void>,
) {
  const original = console[fnName];
  console[fnName] = (...args: unknown[]) => {
    original.apply(console, args);
    const message = args
      .map((arg) =>
        typeof arg === "object" ? JSON.stringify(arg) : String(arg),
      )
      .join(" ");
    logger(message).catch(() => {
      // Ignore logging errors to prevent infinite loops
    });
  };
}

// Re-export log functions for direct usage
export { warn, debug, trace, info, error };
