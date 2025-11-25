import { ReactNode, forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Terminal as XTerm, type IDisposable } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { LigaturesAddon } from "@xterm/addon-ligatures";
import { WebglAddon } from "@xterm/addon-webgl";
import { SearchAddon, ISearchOptions } from "@xterm/addon-search";
import { ClipboardAddon, type IClipboardProvider } from "@xterm/addon-clipboard";
import { ptyCreateSession, ptyListen, ptyResize, ptyWrite, ptySessionExists } from "../lib/api";
import { useTerminalSettings } from "../hooks/useTerminalSettings";
import { cn } from "../lib/utils";
import "@xterm/xterm/css/xterm.css";
import { Loader2 } from "lucide-react";

interface ConsolidatedTerminalProps {
  sessionId: string;
  workingDirectory?: string;
  shell?: string;
  persistSession?: boolean;
  autoCommand?: string;
  autoCommandDelay?: number;
  onAutoCommandComplete?: () => void;
  onAutoCommandError?: (message: string) => void;
  onSessionError?: (message: string) => void;
  onTerminalOutput?: (output: string) => void;
  onTerminalIdle?: () => void;
  idleTimeoutMs?: number;
  rightPanel?: ReactNode;
  showDiffViewer?: boolean;
  showPlanDisplay?: boolean;
  containerClassName?: string;
  terminalPaneClassName?: string;
  rightPaneClassName?: string;
  terminalBackgroundClassName?: string;
  terminalOverlay?: ReactNode;
  clipboardProvider?: IClipboardProvider;
  isHidden?: boolean;
}

export interface ConsolidatedTerminalHandle {
  findNext: (term: string, options?: ISearchOptions) => boolean;
  findPrevious: (term: string, options?: ISearchOptions) => boolean;
  clearSearch: () => void;
  focus: () => void;
}

const normalizeCommand = (command: string) => {
  if (command.endsWith("\r\n") || command.endsWith("\n")) {
    return command;
  }
  return `${command}\r\n`;
};

const createDefaultClipboardProvider = (): IClipboardProvider => ({
  async readText() {
    if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
      try {
        return await navigator.clipboard.readText();
      } catch (error) {
        console.warn("Clipboard read failed", error);
      }
    }
    return "";
  },
  async writeText(_selection, data: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(data);
      } catch (error) {
        console.warn("Clipboard write failed", error);
      }
    }
  },
});

export const ConsolidatedTerminal = forwardRef<ConsolidatedTerminalHandle, ConsolidatedTerminalProps>(
({
  sessionId,
  workingDirectory,
  shell,
  persistSession = true,
  autoCommand,
  autoCommandDelay = 500,
  onAutoCommandComplete,
  onAutoCommandError,
  onSessionError,
  onTerminalOutput,
  onTerminalIdle,
  idleTimeoutMs = 2000,
  rightPanel,
  showDiffViewer,
  showPlanDisplay,
  containerClassName,
  terminalPaneClassName,
  rightPaneClassName,
  terminalBackgroundClassName,
  terminalOverlay,
  clipboardProvider,
  isHidden = false,
}, ref) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const handleResizeRef = useRef<(() => void) | null>(null);
  const webglAddonRef = useRef<WebglAddon | null>(null);
  const webglContextLossDisposeRef = useRef<IDisposable | null>(null);
  const clipboardAddonRef = useRef<ClipboardAddon | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);
  const outputRef = useRef("");
  const autoCommandCompleteRef = useRef(onAutoCommandComplete);
  const autoCommandErrorRef = useRef(onAutoCommandError);
  const sessionErrorRef = useRef(onSessionError);
  const terminalOutputRef = useRef(onTerminalOutput);
  const terminalIdleRef = useRef(onTerminalIdle);
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isPtyReady, setIsPtyReady] = useState(false);
  const isPtyReadyRef = useRef(isPtyReady);
  const lastValidDimensionsRef = useRef<{ rows: number; cols: number } | null>(null);
  const previousIsHiddenRef = useRef(isHidden);
  const autoCommandSentRef = useRef(false);

  const { fontSize } = useTerminalSettings();
  const resolvedClipboardProvider = useMemo(
    () => clipboardProvider ?? createDefaultClipboardProvider(),
    [clipboardProvider]
  );

  useEffect(() => {
    autoCommandCompleteRef.current = onAutoCommandComplete;
  }, [onAutoCommandComplete]);

  useEffect(() => {
    autoCommandErrorRef.current = onAutoCommandError;
  }, [onAutoCommandError]);

  useEffect(() => {
    sessionErrorRef.current = onSessionError;
  }, [onSessionError]);

  useEffect(() => {
    terminalOutputRef.current = onTerminalOutput;
  }, [onTerminalOutput]);

  useEffect(() => {
    terminalIdleRef.current = onTerminalIdle;
  }, [onTerminalIdle]);

  useEffect(() => {
    isPtyReadyRef.current = isPtyReady;
  }, [isPtyReady]);

  useEffect(() => {
    outputRef.current = "";
    autoCommandSentRef.current = false;
  }, [sessionId]);

  useEffect(() => {
    if (!terminalRef.current) {
      return;
    }

    setIsPtyReady(false);
    isPtyReadyRef.current = false;

    const xterm = new XTerm({
      cursorBlink: true,
      cursorStyle: "block",
      fontSize,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: "#1e1e1e",
        foreground: "#d4d4d4",
        cursor: "#d4d4d4",
        cursorAccent: "#1e1e1e",
        selectionBackground: "#264f78",
        selectionForeground: "#ffffff",
        // Standard ANSI colors
        black: "#000000",
        red: "#cd3131",
        green: "#0dbc79",
        yellow: "#e5e510",
        blue: "#2472c8",
        magenta: "#bc3fbc",
        cyan: "#11a8cd",
        white: "#e5e5e5",
        // Bright ANSI colors
        brightBlack: "#666666",
        brightRed: "#f14c4c",
        brightGreen: "#23d18b",
        brightYellow: "#f5f543",
        brightBlue: "#3b8eea",
        brightMagenta: "#d670d6",
        brightCyan: "#29b8db",
        brightWhite: "#ffffff",
      },
      scrollback: 10000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const unicode11Addon = new Unicode11Addon();
    const ligaturesAddon = new LigaturesAddon();
    const searchAddon = new SearchAddon();
    const clipboardAddon = new ClipboardAddon(resolvedClipboardProvider);

    // Load addons that don't require the terminal to be opened first
    xterm.loadAddon(fitAddon);
    xterm.loadAddon(webLinksAddon);
    xterm.loadAddon(unicode11Addon);
    xterm.loadAddon(searchAddon);
    xterm.loadAddon(clipboardAddon);
    xterm.unicode.activeVersion = "11";
    searchAddonRef.current = searchAddon;
    clipboardAddonRef.current = clipboardAddon;

    // Open terminal in DOM first
    xterm.open(terminalRef.current);

    // Load LigaturesAddon AFTER opening (it requires the terminal to be in the DOM)
    xterm.loadAddon(ligaturesAddon);

    // Load WebGL addon before initial fit to prevent renderer issues
    if (typeof window !== "undefined" && "WebGLRenderingContext" in window) {
      try {
        const webglAddon = new WebglAddon();
        webglAddon.onContextLoss(() => {
          console.warn("WebGL context lost; reverting to canvas renderer");
          webglAddonRef.current?.dispose();
          webglAddonRef.current = null;
          webglContextLossDisposeRef.current?.dispose();
          webglContextLossDisposeRef.current = null;
        });
        xterm.loadAddon(webglAddon);
        webglAddonRef.current = webglAddon;
      } catch (error) {
        console.warn("Failed to enable WebGL renderer", error);
        webglAddonRef.current?.dispose();
        webglAddonRef.current = null;
        webglContextLossDisposeRef.current?.dispose();
        webglContextLossDisposeRef.current = null;
      }
    }

    // Fit after all addons are loaded
    fitAddon.fit();

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    const handleError = (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Terminal error:", message);
      if (sessionErrorRef.current) {
        sessionErrorRef.current(message);
      }
    };

    xterm.attachCustomKeyEventHandler((event) => {
      // Let browser handle events when input elements are focused (but not xterm's own textarea)
      const activeElement = document.activeElement as HTMLElement | null;
      const isWithinXterm = activeElement?.closest('.xterm') !== null;
      const isInputFocused =
        !isWithinXterm && (
          activeElement?.tagName === "INPUT" ||
          activeElement?.tagName === "TEXTAREA" ||
          activeElement?.getAttribute("contenteditable") === "true"
        );

      if (isInputFocused) {
        return false; // Don't let xterm handle this event
      }

      // Handle Shift+Enter for newline
      if (event.key === "Enter" && event.shiftKey && event.type === "keydown") {
        if (isPtyReadyRef.current) {
          ptyWrite(sessionId, "\r\n").catch(handleError);
        }
        return false;
      }

      // Allow browser shortcuts (Cmd/Ctrl + key) to pass through to browser
      // Except for terminal-specific ones like Ctrl+C (interrupt), Ctrl+D (EOF), Ctrl+Z (suspend)
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const isModifierPressed = isMac ? event.metaKey : event.ctrlKey;

      if (isModifierPressed && event.type === "keydown") {
        const key = event.key.toLowerCase();
        // Terminal control characters that should be sent to PTY
        const terminalControlKeys = ["c", "d", "z", "l", "u", "w", "r"];
        // On Mac, Ctrl+key should go to terminal, Cmd+key should go to browser
        // On other platforms, just check if it's a terminal control key
        if (isMac && event.metaKey) {
          // Cmd+key on Mac - let browser handle it (select all, copy, paste, find, etc.)
          return false;
        }
        if (!isMac && event.ctrlKey && !terminalControlKeys.includes(key)) {
          // Ctrl+key on non-Mac that's not a terminal control - let browser handle it
          return false;
        }
      }

      return true;
    });

    xterm.onData((data) => {
      if (!isPtyReadyRef.current) {
        return;
      }
      ptyWrite(sessionId, data).catch(handleError);
    });

    let autoCommandTimeout: ReturnType<typeof setTimeout> | null = null;
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;

    const handleResize = () => {
      fitAddon.fit();
      const { rows, cols } = xterm;

      // Store last valid dimensions
      lastValidDimensionsRef.current = { rows, cols };

      if (!isPtyReadyRef.current) {
        return;
      }
      ptyResize(sessionId, rows, cols).catch(handleError);
    };

    // Store handleResize in ref for use by visibility effect
    handleResizeRef.current = handleResize;

    // Only set up resize observers if not hidden
    // Visibility effect will manage connection/disconnection
    if (!isHidden && terminalRef.current) {
      window.addEventListener("resize", handleResize);
      resizeObserverRef.current = new ResizeObserver(handleResize);
      resizeObserverRef.current.observe(terminalRef.current);
    }

    // Check if PTY session already exists, if not create it
    const setupPty = async () => {
      try {
        const exists = await ptySessionExists(sessionId);
        const isNewSession = !exists;

        if (isNewSession) {
          await ptyCreateSession(sessionId, workingDirectory, shell);
        }

        const unlisten = await ptyListen(sessionId, (chunk) => {
          xterm.write(chunk);
          outputRef.current += chunk;
          if (terminalOutputRef.current) {
            terminalOutputRef.current(outputRef.current);
          }
          // Reset idle timeout on each output chunk
          if (idleTimeoutRef.current) {
            clearTimeout(idleTimeoutRef.current);
          }
          idleTimeoutRef.current = setTimeout(() => {
            terminalIdleRef.current?.();
          }, idleTimeoutMs);
        });
        unlistenRef.current = unlisten;
        setIsPtyReady(true);
        isPtyReadyRef.current = true;

        // Now that PTY is ready, perform initial resize
        resizeTimeout = setTimeout(handleResize, 100);

        // Only run autoCommand for newly created sessions, not when reattaching
        // Use ref guard to ensure command is only sent once per session
        if (autoCommand && isNewSession && !autoCommandSentRef.current) {
          autoCommandTimeout = setTimeout(() => {
            // Check again inside timeout in case effect re-ran
            if (autoCommandSentRef.current) {
              return;
            }
            autoCommandSentRef.current = true;
            ptyWrite(sessionId, normalizeCommand(autoCommand))
              .then(() => {
                autoCommandCompleteRef.current?.();
              })
              .catch((error) => {
                const message = error instanceof Error ? error.message : String(error);
                if (autoCommandErrorRef.current) {
                  autoCommandErrorRef.current(message);
                } else {
                  handleError(message);
                }
              });
          }, autoCommandDelay);
        }
      } catch (error) {
        handleError(error);
      }
    };

    setupPty();

    return () => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      if (autoCommandTimeout) {
        clearTimeout(autoCommandTimeout);
      }
      if (idleTimeoutRef.current) {
        clearTimeout(idleTimeoutRef.current);
        idleTimeoutRef.current = null;
      }
      if (handleResizeRef.current) {
        window.removeEventListener("resize", handleResizeRef.current);
      }
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      handleResizeRef.current = null;
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
      // Keep PTY session alive in background (don't close on unmount)
      // PTY will only be closed when session is explicitly deleted
      xterm.dispose();
      searchAddonRef.current = null;
      webglAddonRef.current?.dispose();
      webglAddonRef.current = null;
      webglContextLossDisposeRef.current?.dispose();
      webglContextLossDisposeRef.current = null;
      clipboardAddonRef.current?.dispose();
      clipboardAddonRef.current = null;
      setIsPtyReady(false);
      isPtyReadyRef.current = false;
    };
  }, [
    sessionId,
    workingDirectory,
    shell,
    fontSize,
    autoCommand,
    autoCommandDelay,
    persistSession,
    resolvedClipboardProvider,
    idleTimeoutMs,
  ]);

  // Handle visibility transitions and manage ResizeObserver
  useEffect(() => {
    const wasHidden = previousIsHiddenRef.current;
    const isNowVisible = !isHidden;
    const isNowHidden = isHidden;

    if (wasHidden && isNowVisible) {
      // Terminal is transitioning from hidden to visible
      // Reconnect ResizeObserver and trigger resize
      if (terminalRef.current && handleResizeRef.current) {
        window.addEventListener("resize", handleResizeRef.current);
        resizeObserverRef.current = new ResizeObserver(handleResizeRef.current);
        resizeObserverRef.current.observe(terminalRef.current);
      }

      // Trigger resize to restore proper dimensions
      if (fitAddonRef.current && xtermRef.current && isPtyReady) {
        fitAddonRef.current.fit();
        const { rows, cols } = xtermRef.current;
        lastValidDimensionsRef.current = { rows, cols };
        ptyResize(sessionId, rows, cols).catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          console.error("Terminal error:", message);
        });
      }
    } else if (!wasHidden && isNowHidden) {
      // Terminal is transitioning from visible to hidden
      // Disconnect ResizeObserver to prevent unnecessary callbacks
      if (handleResizeRef.current) {
        window.removeEventListener("resize", handleResizeRef.current);
      }
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
    }

    previousIsHiddenRef.current = isHidden;
  }, [isHidden, isPtyReady, sessionId]);

  useImperativeHandle(ref, () => ({
    findNext: (term: string, options?: ISearchOptions) => {
      if (!term || !searchAddonRef.current) {
        return false;
      }
      return searchAddonRef.current.findNext(term, options);
    },
    findPrevious: (term: string, options?: ISearchOptions) => {
      if (!term || !searchAddonRef.current) {
        return false;
      }
      return searchAddonRef.current.findPrevious(term, options);
    },
    clearSearch: () => {
      searchAddonRef.current?.clearDecorations();
    },
    focus: () => {
      xtermRef.current?.focus();
    },
  }));

  const terminalPaneWidthClass = useMemo(() => {
    if (!rightPanel) {
      return "flex-1";
    }
    if (showDiffViewer) {
      return "w-1/3";
    }
    if (showPlanDisplay) {
      return "flex-1";
    }
    return "flex-1";
  }, [rightPanel, showDiffViewer, showPlanDisplay]);

  const rightPaneWidthClass = useMemo(() => {
    if (!rightPanel) {
      return "";
    }
    if (showDiffViewer) {
      return "w-2/3";
    }
    if (showPlanDisplay) {
      return "w-1/2";
    }
    return "flex-1";
  }, [rightPanel, showDiffViewer, showPlanDisplay]);

  return (
    <div className={cn("flex-1 flex overflow-hidden w-full h-full", containerClassName)}>
      <div
        className={cn(
          "min-w-0 relative",
          terminalPaneWidthClass,
          terminalBackgroundClassName ?? "bg-[#1e1e1e]",
          terminalPaneClassName,
        )}
      >
        <div ref={terminalRef} className="h-full w-full" />
        {!isPtyReady && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 text-sm text-muted-foreground z-10">
            <Loader2 className="w-5 h-5 animate-spin mb-2" />
            <span>Preparing terminal...</span>
          </div>
        )}
        {terminalOverlay ?? null}
      </div>
      {rightPanel ? (
        <div className={cn("border-l border-border", rightPaneWidthClass, rightPaneClassName)}>
          {rightPanel}
        </div>
      ) : null}
    </div>
  );
});

ConsolidatedTerminal.displayName = "ConsolidatedTerminal";
