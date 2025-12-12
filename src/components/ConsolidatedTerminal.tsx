import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Terminal as XTerm, type IDisposable } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { LigaturesAddon } from "@xterm/addon-ligatures";
import { WebglAddon } from "@xterm/addon-webgl";
import { SearchAddon, ISearchOptions } from "@xterm/addon-search";
import {
  ptyCreateSession,
  ptyListen,
  ptyResize,
  ptyWrite,
  ptySessionExists,
} from "../lib/api";
import { useTerminalSettings } from "../hooks/useTerminalSettings";
import { cn } from "../lib/utils";
import { Loader2 } from "lucide-react";
import { Button } from "./ui/button";

interface ConsolidatedTerminalProps {
  sessionId: string;
  workingDirectory?: string;
  shell?: string;
  autoCommand?: string;
  onSessionError?: (message: string) => void;
  onTerminalOutput?: (output: string) => void;
  onTerminalIdle?: () => void;
  onClose?: () => void;
  idleTimeoutMs?: number;
  containerClassName?: string;
  terminalPaneClassName?: string;
  terminalBackgroundClassName?: string;
  isHidden?: boolean;
  /** Skip loading state - useful for split terminals where seamless appearance is preferred */
  skipLoadingState?: boolean;
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

export const ConsolidatedTerminal = forwardRef<
  ConsolidatedTerminalHandle,
  ConsolidatedTerminalProps
>(
  (
    {
      sessionId,
      workingDirectory,
      shell,
      autoCommand,
      onSessionError,
      onTerminalOutput,
      onTerminalIdle,
      onClose,
      idleTimeoutMs = 2000,
      containerClassName,
      terminalPaneClassName,
      terminalBackgroundClassName,
      isHidden = false,
      skipLoadingState = false,
    },
    ref
  ) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<XTerm | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const searchAddonRef = useRef<SearchAddon | null>(null);
    const resizeObserverRef = useRef<ResizeObserver | null>(null);
    const webglAddonRef = useRef<WebglAddon | null>(null);
    const webglContextLossDisposeRef = useRef<IDisposable | null>(null);
    const unlistenRef = useRef<(() => void) | null>(null);
    const outputRef = useRef("");
    const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [isPtyReady, setIsPtyReady] = useState(false);
    const isPtyReadyRef = useRef(isPtyReady);
    const lastValidDimensionsRef = useRef<{
      rows: number;
      cols: number;
    } | null>(null);
    const autoCommandSentRef = useRef(false);
    const [terminalError, setTerminalError] = useState<string | null>(null);
    const [instanceKey, setInstanceKey] = useState(0);

    // Store callbacks in refs to avoid effect re-runs
    const onSessionErrorRef = useRef(onSessionError);
    const onTerminalOutputRef = useRef(onTerminalOutput);
    const onTerminalIdleRef = useRef(onTerminalIdle);

    const { fontSize } = useTerminalSettings();


    // Sync isPtyReady state with ref for use in callbacks
    useEffect(() => {
      isPtyReadyRef.current = isPtyReady;
    }, [isPtyReady]);

    // Keep callback refs in sync
    useEffect(() => {
      onSessionErrorRef.current = onSessionError;
    }, [onSessionError]);

    useEffect(() => {
      onTerminalOutputRef.current = onTerminalOutput;
    }, [onTerminalOutput]);

    useEffect(() => {
      onTerminalIdleRef.current = onTerminalIdle;
    }, [onTerminalIdle]);

    // Reset output and error when session changes
    useEffect(() => {
      outputRef.current = "";
      autoCommandSentRef.current = false;
      setTerminalError(null);
    }, [sessionId, instanceKey]);

    const handleRetryTerminal = useCallback(() => {
      setTerminalError(null);
      setInstanceKey((prev) => prev + 1);
    }, []);

    // Main terminal setup effect - all handlers are inlined to avoid stale closures
    useEffect(() => {
      if (!terminalRef.current) return;

      setIsPtyReady(false);
      isPtyReadyRef.current = false;

      // Local error handler
      const localHandleError = (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error("Terminal error:", message);
        const friendlyMessage = message.includes("Session not found")
          ? "Terminal session is still initializing. Please wait a moment and try again."
          : message;
        setTerminalError(friendlyMessage);
        onSessionErrorRef.current?.(friendlyMessage);
      };

      const xterm = new XTerm({
        cursorBlink: true,
        cursorStyle: "bar",
        fontSize,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: { background: "#1e1e1e" },
        scrollback: 5000,
        allowProposedApi: true,
      });

      const fitAddon = new FitAddon();
      const searchAddon = new SearchAddon();

      // Load addons before opening
      xterm.loadAddon(fitAddon);
      xterm.loadAddon(new WebLinksAddon());
      xterm.loadAddon(new Unicode11Addon());
      xterm.loadAddon(searchAddon);
      xterm.unicode.activeVersion = "11";

      searchAddonRef.current = searchAddon;

      // Open terminal in DOM
      xterm.open(terminalRef.current);

      // Load LigaturesAddon after opening (requires DOM)
      xterm.loadAddon(new LigaturesAddon());

      // Load WebGL addon
      if (
        typeof window !== "undefined" &&
        "WebGLRenderingContext" in window &&
        xterm.element
      ) {
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
        }
      }

      xtermRef.current = xterm;
      fitAddonRef.current = fitAddon;

      // Local resize handler
      const localHandleResize = () => {
        const terminal = terminalRef.current;
        if (!terminal || !xterm || !fitAddon) return;

        const rect = terminal.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        if (!("buffer" in xterm)) return;

        try {
          fitAddon.fit();
          const { rows, cols } = xterm;
          lastValidDimensionsRef.current = { rows, cols };

          if (isPtyReadyRef.current) {
            ptyResize(sessionId, rows, cols).catch(localHandleError);
          }
        } catch (error) {
          console.warn("Resize failed", error);
        }
      };

      // Local key event handler
      const localHandleKeyEvent = (event: KeyboardEvent): boolean => {
        const activeElement = document.activeElement as HTMLElement | null;
        const isWithinXterm = activeElement?.closest(".xterm") !== null;
        const isInputFocused =
          !isWithinXterm &&
          (activeElement?.tagName === "INPUT" ||
            activeElement?.tagName === "TEXTAREA" ||
            activeElement?.getAttribute("contenteditable") === "true");

        if (isInputFocused) {
          return false;
        }

        // Handle Shift+Enter for line continuation
        if (
          event.key === "Enter" &&
          event.shiftKey &&
          event.type === "keydown"
        ) {
          if (isPtyReadyRef.current) {
            ptyWrite(sessionId, "\\").catch(localHandleError);
          }
          return false;
        }

        return true;
      };

      // Local xterm data handler
      const localHandleXtermData = (data: string) => {
        if (!isPtyReadyRef.current) return;
        ptyWrite(sessionId, data).catch(localHandleError);
      };

      // Local PTY output handler
      const localHandlePtyOutput = (chunk: string) => {
        xterm.write(chunk);
        outputRef.current += chunk;
        onTerminalOutputRef.current?.(outputRef.current);

        if (idleTimeoutRef.current) {
          clearTimeout(idleTimeoutRef.current);
        }
        idleTimeoutRef.current = setTimeout(() => {
          onTerminalIdleRef.current?.();
        }, idleTimeoutMs);
      };

      xterm.attachCustomKeyEventHandler(localHandleKeyEvent);
      xterm.onData(localHandleXtermData);

      let resizeTimeout: ReturnType<typeof setTimeout> | null = null;

      // Setup PTY
      const setupPty = async () => {
        try {
          const exists = await ptySessionExists(sessionId);
          const isNewSession = !exists;

          if (isNewSession) {
            await ptyCreateSession(sessionId, workingDirectory, shell);
          }

          const unlisten = await ptyListen(sessionId, localHandlePtyOutput);
          unlistenRef.current = unlisten;
          setIsPtyReady(true);
          isPtyReadyRef.current = true;

          resizeTimeout = setTimeout(localHandleResize, 100);

          if (autoCommand && isNewSession && !autoCommandSentRef.current) {
            autoCommandSentRef.current = true;
            ptyWrite(sessionId, normalizeCommand(autoCommand)).catch(
              localHandleError
            );
          }
        } catch (error) {
          localHandleError(error);
        }
      };

      setupPty();

      return () => {
        if (resizeTimeout) clearTimeout(resizeTimeout);
        if (idleTimeoutRef.current) {
          clearTimeout(idleTimeoutRef.current);
          idleTimeoutRef.current = null;
        }

        unlistenRef.current?.();
        unlistenRef.current = null;

        xterm.dispose();
        searchAddonRef.current = null;
        webglAddonRef.current?.dispose();
        webglAddonRef.current = null;
        webglContextLossDisposeRef.current?.dispose();
        webglContextLossDisposeRef.current = null;

        setIsPtyReady(false);
        isPtyReadyRef.current = false;
      };
    }, [
      sessionId,
      workingDirectory,
      shell,
      fontSize,
      autoCommand,
      instanceKey,
      idleTimeoutMs,
    ]);

    // Separate effect to handle resize observer based on visibility
    useEffect(() => {
      if (!terminalRef.current || !xtermRef.current || !fitAddonRef.current) return;

      const xterm = xtermRef.current;
      const fitAddon = fitAddonRef.current;
      const terminal = terminalRef.current;

      const handleResize = () => {
        if (!terminal || !xterm || !fitAddon) return;

        const rect = terminal.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        if (!("buffer" in xterm)) return;

        try {
          fitAddon.fit();
          const { rows, cols } = xterm;
          lastValidDimensionsRef.current = { rows, cols };

          if (isPtyReadyRef.current) {
            ptyResize(sessionId, rows, cols).catch((error) => {
              console.error("Resize error:", error);
            });
          }
        } catch (error) {
          console.warn("Resize failed", error);
        }
      };

      if (isHidden) {
        // Clean up resize observers when hidden
        window.removeEventListener("resize", handleResize);
        resizeObserverRef.current?.disconnect();
        resizeObserverRef.current = null;
        return;
      }

      // Set up resize observers when visible
      window.addEventListener("resize", handleResize);
      resizeObserverRef.current = new ResizeObserver(handleResize);
      resizeObserverRef.current.observe(terminal);

      // Initial fit when becoming visible
      requestAnimationFrame(() => {
        if (!terminal) return;
        const rect = terminal.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        try {
          fitAddon.fit();
        } catch (error) {
          console.warn("Initial fit failed", error);
        }
      });

      return () => {
        window.removeEventListener("resize", handleResize);
        resizeObserverRef.current?.disconnect();
        resizeObserverRef.current = null;
      };
    }, [isHidden, sessionId]);

    useImperativeHandle(ref, () => ({
      findNext: (term: string, options?: ISearchOptions) => {
        if (!term || !searchAddonRef.current) return false;
        return searchAddonRef.current.findNext(term, options);
      },
      findPrevious: (term: string, options?: ISearchOptions) => {
        if (!term || !searchAddonRef.current) return false;
        return searchAddonRef.current.findPrevious(term, options);
      },
      clearSearch: () => {
        searchAddonRef.current?.clearDecorations();
      },
      focus: () => {
        xtermRef.current?.focus();
      },
    }));

    return (
      <div
        className={cn(
          "flex-1 flex overflow-hidden w-full h-full",
          containerClassName
        )}
      >
        <div
          className={cn(
            "min-w-0 relative w-2/5",
            terminalBackgroundClassName,
            terminalPaneClassName
          )}
        >
          <div
            ref={terminalRef}
            className={cn(
              "h-full w-full",
              "[&_.xterm-viewport::-webkit-scrollbar]:w-2",
              "[&_.xterm-viewport::-webkit-scrollbar-track]:bg-transparent",
              "[&_.xterm-viewport::-webkit-scrollbar-thumb]:bg-border",
              "[&_.xterm-viewport::-webkit-scrollbar-thumb]:rounded"
            )}
          />
          {!isPtyReady && !terminalError && !skipLoadingState && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 text-sm text-muted-foreground z-10">
              <Loader2 className="w-5 h-5 animate-spin mb-2" />
              <span>Preparing terminal...</span>
            </div>
          )}
          {terminalError && (
            <div className="absolute inset-0 bg-background/90 backdrop-blur-sm flex items-center justify-center z-20 p-6">
              <div className="w-full max-w-sm rounded-lg border bg-card p-4 text-center shadow-lg">
                <p className="text-sm font-semibold">
                  Unable to start terminal
                </p>
                <p className="text-xs text-muted-foreground mt-2 break-words">
                  {terminalError}
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  <Button size="sm" onClick={handleRetryTerminal}>
                    Try again
                  </Button>
                  {onClose && (
                    <Button size="sm" variant="outline" onClick={onClose}>
                      Close session
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
);

ConsolidatedTerminal.displayName = "ConsolidatedTerminal";
