import { ReactNode, useEffect, useMemo, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { ptyClose, ptyCreateSession, ptyListen, ptyResize, ptyWrite } from "../lib/api";
import { useTerminalSettings } from "../hooks/useTerminalSettings";
import { cn } from "../lib/utils";
import "@xterm/xterm/css/xterm.css";

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
  rightPanel?: ReactNode;
  showDiffViewer?: boolean;
  showPlanDisplay?: boolean;
  containerClassName?: string;
  terminalPaneClassName?: string;
  rightPaneClassName?: string;
  terminalBackgroundClassName?: string;
  terminalOverlay?: ReactNode;
}

const normalizeCommand = (command: string) => {
  if (command.endsWith("\r\n") || command.endsWith("\n")) {
    return command;
  }
  return `${command}\r\n`;
};

export const ConsolidatedTerminal: React.FC<ConsolidatedTerminalProps> = ({
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
  rightPanel,
  showDiffViewer,
  showPlanDisplay,
  containerClassName,
  terminalPaneClassName,
  rightPaneClassName,
  terminalBackgroundClassName,
  terminalOverlay,
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);
  const outputRef = useRef("");
  const autoCommandCompleteRef = useRef(onAutoCommandComplete);
  const autoCommandErrorRef = useRef(onAutoCommandError);
  const sessionErrorRef = useRef(onSessionError);
  const terminalOutputRef = useRef(onTerminalOutput);

  const { fontSize } = useTerminalSettings();

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
    outputRef.current = "";
  }, [sessionId]);

  useEffect(() => {
    if (!terminalRef.current) {
      return;
    }

    const xterm = new XTerm({
      cursorBlink: true,
      fontSize,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: "#1e1e1e",
        foreground: "#d4d4d4",
        cursor: "#d4d4d4",
      },
      scrollback: 10000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const unicode11Addon = new Unicode11Addon();

    xterm.loadAddon(fitAddon);
    xterm.loadAddon(webLinksAddon);
    xterm.loadAddon(unicode11Addon);
    xterm.unicode.activeVersion = "11";

    xterm.open(terminalRef.current);
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
      const isCmdOrCtrl = event.metaKey || event.ctrlKey;

      if (isCmdOrCtrl && event.key === "c" && event.type === "keydown") {
        if (xterm.hasSelection()) {
          const selection = xterm.getSelection();
          navigator.clipboard.writeText(selection).catch(console.error);
          return false;
        }
      }

      if (isCmdOrCtrl && event.key === "v" && event.type === "keydown") {
        navigator.clipboard
          .readText()
          .then((text) => ptyWrite(sessionId, text).catch(console.error))
          .catch(console.error);
        return false;
      }

      if (event.key === "Enter" && event.shiftKey && event.type === "keydown") {
        ptyWrite(sessionId, "\r\n").catch(handleError);
        return false;
      }

      return true;
    });

    xterm.onData((data) => {
      ptyWrite(sessionId, data).catch(handleError);
    });

    let resizeObserver: ResizeObserver | null = null;
    let autoCommandTimeout: ReturnType<typeof setTimeout> | null = null;

    ptyCreateSession(sessionId, workingDirectory, shell)
      .then(async () => {
        const unlisten = await ptyListen(sessionId, (chunk) => {
          xterm.write(chunk);
          outputRef.current += chunk;
          if (terminalOutputRef.current) {
            terminalOutputRef.current(outputRef.current);
          }
        });
        unlistenRef.current = unlisten;

        if (autoCommand) {
          autoCommandTimeout = setTimeout(() => {
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
      })
      .catch(handleError);

    const handleResize = () => {
      fitAddon.fit();
      const { rows, cols } = xterm;
      ptyResize(sessionId, rows, cols).catch(handleError);
    };

    const resizeTimeout = setTimeout(handleResize, 100);
    window.addEventListener("resize", handleResize);
    resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(terminalRef.current);

    return () => {
      clearTimeout(resizeTimeout);
      if (autoCommandTimeout) {
        clearTimeout(autoCommandTimeout);
      }
      window.removeEventListener("resize", handleResize);
      resizeObserver?.disconnect();
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
      if (!persistSession) {
        ptyClose(sessionId).catch(console.error);
      }
      xterm.dispose();
    };
  }, [sessionId, workingDirectory, shell, fontSize, autoCommand, autoCommandDelay, persistSession]);

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
        {terminalOverlay ?? null}
      </div>
      {rightPanel ? (
        <div className={cn("border-l border-border", rightPaneWidthClass, rightPaneClassName)}>
          {rightPanel}
        </div>
      ) : null}
    </div>
  );
};
