import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { ptyCreateSession, ptyWrite, ptyListen, ptyClose, ptyResize, Worktree } from "../lib/api";
import { StagingDiffViewer } from "./StagingDiffViewer";
import { Button } from "./ui/button";
import { X } from "lucide-react";
import { useToast } from "./ui/toast";
import { useTerminalSettings } from "../hooks/useTerminalSettings";
import "@xterm/xterm/css/xterm.css";

interface ExecutionTerminalProps {
  repositoryPath?: string;
  worktree?: Worktree;
  onClose: () => void;
}

export const ExecutionTerminal: React.FC<ExecutionTerminalProps> = ({
  repositoryPath,
  worktree,
  onClose,
}) => {
  // Determine working directory
  const workingDirectory = worktree?.worktree_path || repositoryPath || "";
  
  // Generate session ID based on context
  const [sessionId] = useState(() => 
    worktree ? `execution-worktree-${worktree.id}` : `execution-main-${crypto.randomUUID()}`
  );
  
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);
  
  const { addToast } = useToast();
  const { fontSize } = useTerminalSettings();

  // Terminal initialization
  useEffect(() => {
    if (!terminalRef.current) return;

    console.log("Initializing execution terminal for session:", sessionId);
    
    // 1. Dispose old terminal if exists
    if (xtermRef.current) {
      console.log("Disposing old terminal");
      xtermRef.current.dispose();
    }

    // 2. Create new terminal
    const xterm = new XTerm({
      cursorBlink: true,
      fontSize: fontSize,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: "#1e1e1e",
        foreground: "#d4d4d4",
        cursor: "#d4d4d4",
      },
      scrollback: 10000,
    });

    // 3. Setup addons
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    xterm.loadAddon(fitAddon);
    xterm.loadAddon(webLinksAddon);

    // 4. Open terminal and fit
    xterm.open(terminalRef.current);
    fitAddon.fit();
    console.log("Terminal opened, dimensions:", xterm.cols, "x", xterm.rows);

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // 5. Handle copy/paste
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

    // 6. Handle terminal input
    xterm.onData((data) => {
      ptyWrite(sessionId, data).catch((error) => {
        console.error("PTY write error:", error);
      });
    });

    // 7. Create PTY session immediately
    ptyCreateSession(sessionId, workingDirectory)
      .then(async () => {
        console.log("PTY session created successfully for:", workingDirectory);
        
        // Setup output listener
        const unlisten = await ptyListen(sessionId, (data) => {
          xterm.write(data);
        });
        
        unlistenRef.current = unlisten;
        console.log("PTY listener attached");
        
        // Wait for shell to be ready, then execute claude command in acceptEdits mode
        setTimeout(() => {
          console.log("Executing: claude --permission-mode acceptEdits");
          ptyWrite(sessionId, "claude --permission-mode acceptEdits\n")
            .then(() => console.log("Command sent successfully"))
            .catch((error) => {
              console.error("Failed to execute command:", error);
              addToast({
                title: "Command Error",
                description: "Failed to execute claude command",
                type: "error",
              });
            });
        }, 500);
      })
      .catch((error) => {
        console.error("PTY creation error:", error);
        addToast({
          title: "PTY Error",
          description: error instanceof Error ? error.message : String(error),
          type: "error",
        });
      });

    // 8. Setup resize handling
    const handleResize = () => {
      fitAddon.fit();
      const { rows, cols } = xterm;
      ptyResize(sessionId, rows, cols).catch(console.error);
    };

    // Initial resize after a brief delay
    setTimeout(handleResize, 100);

    // Listen for window resize
    window.addEventListener("resize", handleResize);

    // Listen for container resize
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(terminalRef.current);

    // 9. Cleanup on unmount
    return () => {
      console.log("Cleaning up execution terminal session:", sessionId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleResize);
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
      ptyClose(sessionId).catch(console.error);
      xterm.dispose();
    };
  }, [sessionId, workingDirectory, addToast, fontSize]);

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="border-b p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">Execution Terminal</h2>
          {worktree ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-mono bg-secondary px-2 py-1 rounded">{worktree.branch_name}</span>
              <span>•</span>
              <span className="truncate max-w-md">{worktree.worktree_path}</span>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">
              {workingDirectory.split('/').pop() || workingDirectory.split('\\').pop()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Two-panel layout: Terminal on left (33%), Diff viewer on right (67%) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel - Terminal */}
        <div className="w-1/3 min-w-0 relative bg-[#1e1e1e] border-r">
          <div ref={terminalRef} className="h-full w-full" />
        </div>

        {/* Right panel - StagingDiffViewer in read-only mode */}
        <div className="w-2/3 border-l border-border">
          <StagingDiffViewer 
            worktreePath={workingDirectory} 
            readOnly={true}
          />
        </div>
      </div>
    </div>
  );
};

