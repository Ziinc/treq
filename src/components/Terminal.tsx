import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { ptyCreateSession, ptyWrite, ptyListen, ptyClose, ptyResize } from "../lib/api";
import { useTerminalSettings } from "../hooks/useTerminalSettings";
import "@xterm/xterm/css/xterm.css";

interface TerminalProps {
  sessionId: string;
  workingDir?: string;
  shell?: string;
}

export const Terminal: React.FC<TerminalProps> = ({ sessionId, workingDir, shell }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const { fontSize } = useTerminalSettings();

  useEffect(() => {
    if (!terminalRef.current) return;

    const xterm = new XTerm({
      cursorBlink: true,
      fontSize: fontSize,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: "#1e1e1e",
        foreground: "#d4d4d4",
      },
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    xterm.loadAddon(fitAddon);
    xterm.loadAddon(webLinksAddon);
    xterm.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // Handle copy/paste
    xterm.attachCustomKeyEventHandler((event) => {
      const isCmdOrCtrl = event.metaKey || event.ctrlKey;
      
      // Copy: Cmd/Ctrl+C
      if (isCmdOrCtrl && event.key === 'c' && event.type === 'keydown') {
        if (xterm.hasSelection()) {
          const selection = xterm.getSelection();
          navigator.clipboard.writeText(selection).catch(console.error);
          return false; // Prevent default terminal behavior
        }
      }
      
      // Paste: Cmd/Ctrl+V
      if (isCmdOrCtrl && event.key === 'v' && event.type === 'keydown') {
        navigator.clipboard.readText()
          .then(text => {
            ptyWrite(sessionId, text).catch(console.error);
          })
          .catch(console.error);
        return false; // Prevent default terminal behavior
      }
      
      return true; // Allow other keys to pass through
    });

    // Handle terminal input
    xterm.onData((data) => {
      ptyWrite(sessionId, data).catch(console.error);
    });

    // Create PTY session
    ptyCreateSession(sessionId, workingDir, shell)
      .then(() => {
        // Listen for output
        const unlisten = ptyListen(sessionId, (data) => {
          xterm.write(data);
        });
        return unlisten;
      })
      .catch(console.error);

    // Handle resize
    const handleResize = () => {
      fitAddon.fit();
      // Notify backend of new size
      const { rows, cols } = xterm;
      ptyResize(sessionId, rows, cols).catch(console.error);
    };
    
    // Initial resize
    setTimeout(handleResize, 100);
    
    window.addEventListener("resize", handleResize);
    
    // Also handle when the terminal container resizes
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(terminalRef.current);

    return () => {
      window.removeEventListener("resize", handleResize);
      resizeObserver.disconnect();
      ptyClose(sessionId).catch(console.error);
      xterm.dispose();
    };
  }, [sessionId, workingDir, shell, fontSize]);

  return (
    <div ref={terminalRef} className="h-full w-full" />
  );
};

