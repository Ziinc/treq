import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { ptyCreateSession, ptyWrite, ptyListen, ptyClose, ptyResize, savePlanToRepo, loadPlanFromRepo, savePlanToFile, Worktree, PlanMetadata, saveExecutedPlan } from "../lib/api";
import { PlanSection } from "../types/planning";
import { createDebouncedParser } from "../lib/planParser";
import { PlanDisplay } from "./PlanDisplay";
import { Button } from "./ui/button";
import { X, RotateCw, Loader2 } from "lucide-react";
import { useToast } from "./ui/toast";
import { useTerminalSettings } from "../hooks/useTerminalSettings";
import { buildPlanHistoryPayload } from "../lib/planHistory";
import "@xterm/xterm/css/xterm.css";

interface PlanningTerminalProps {
  repositoryPath?: string;
  worktree?: Worktree;
  onClose: () => void;
  onExecutePlan?: (section: PlanSection) => void;
}

export const PlanningTerminal: React.FC<PlanningTerminalProps> = ({
  repositoryPath,
  worktree,
  onClose,
  onExecutePlan,
}) => {
  // Determine working directory and repo path
  const workingDirectory = worktree?.worktree_path || repositoryPath || "";
  const effectiveRepoPath = worktree?.repo_path || repositoryPath || "";
  
  // Generate session ID based on context
  const [sessionId, setSessionId] = useState(() => 
    worktree ? `planning-worktree-${worktree.id}` : `planning-repo-${crypto.randomUUID()}`
  );
  const [planSections, setPlanSections] = useState<PlanSection[]>([]);
  const [terminalOutput, setTerminalOutput] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);
  const debouncedParserRef = useRef(createDebouncedParser(1000)); // 1000ms to capture complete plans
  
  const { addToast } = useToast();
  const { fontSize } = useTerminalSettings();

  const handleExecuteSection = useCallback(async (section: PlanSection) => {
    if (worktree) {
      try {
        const payload = buildPlanHistoryPayload(section);
        await saveExecutedPlan(worktree.repo_path, worktree.id, payload);
      } catch (error) {
        addToast({
          title: "Plan History",
          description: error instanceof Error ? error.message : String(error),
          type: "error",
        });
      }
    }

    if (onExecutePlan) {
      onExecutePlan(section);
    }
  }, [worktree, onExecutePlan, addToast]);

  const handlePlanEdit = useCallback(async (planId: string, newContent: string) => {
    try {
      // Update plan sections in state
      const updatedSection = planSections.find(s => s.id === planId);
      
      setPlanSections(prev => prev.map(section => {
        if (section.id === planId) {
          return {
            ...section,
            editedContent: newContent,
            isEdited: true,
          };
        }
        return section;
      }));

      // Save to both file storage and database
      const metadata: PlanMetadata = {
        id: planId,
        title: updatedSection?.title || "Untitled Plan",
        plan_type: updatedSection?.type || "implementation_plan",
        worktree_id: worktree?.id,
        worktree_path: worktree?.worktree_path,
        branch_name: worktree?.branch_name,
        timestamp: new Date().toISOString(),
      };

      // Save to .treq/plans/ file
      await savePlanToFile(effectiveRepoPath, planId, newContent, metadata);
      
      // Also save to database (legacy support)
      await savePlanToRepo(effectiveRepoPath, planId, newContent);
    } catch (error) {
      console.error('Failed to save plan:', error);
      addToast({
        title: "Save Failed",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
    }
  }, [effectiveRepoPath, worktree, planSections, addToast]);

  const handleReset = useCallback(async () => {
    setIsResetting(true);
    
    try {
      // Close current session
      await ptyClose(sessionId).catch(console.error);
      
      // Clear plan data
      setPlanSections([]);
      setTerminalOutput("");
      
      // Generate new session ID (triggers useEffect re-run)
      const newSessionId = worktree 
        ? `planning-worktree-${worktree.id}-${Date.now()}` 
        : `planning-repo-${crypto.randomUUID()}`;
      setSessionId(newSessionId);
      
      addToast({
        title: "Terminal Reset",
        description: "Starting new planning session",
        type: "info",
      });
    } catch (error) {
      addToast({
        title: "Reset Failed",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
    } finally {
      setIsResetting(false);
    }
  }, [sessionId, worktree, addToast]);

  // Parse terminal output for plan sections and merge with saved edits
  useEffect(() => {
    if (terminalOutput) {
      debouncedParserRef.current(terminalOutput, async (sections) => {
        // Load saved edits for each plan
        const sectionsWithEdits = await Promise.all(
          sections.map(async (section) => {
            try {
              const savedPlan = await loadPlanFromRepo(effectiveRepoPath, section.id);
              if (savedPlan) {
                return {
                  ...section,
                  editedContent: savedPlan.content,
                  isEdited: true,
                };
              }
            } catch (error) {
              console.error(`Failed to load plan ${section.id}:`, error);
            }
            return section;
          })
        );
        setPlanSections(sectionsWithEdits);
      });
    }
  }, [terminalOutput, effectiveRepoPath]);

  // Main terminal initialization useEffect - consolidates all terminal setup
  useEffect(() => {
    if (!terminalRef.current) return;

    console.log("Initializing terminal for session:", sessionId);
    
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
          setTerminalOutput((prev) => prev + data);
        });
        
        unlistenRef.current = unlisten;
        console.log("PTY listener attached");
        
        // Wait for shell to be ready, then execute claude command
        // Use "plan" mode for both worktree and repo contexts
        const claudeMode = "plan";
        setTimeout(() => {
          console.log(`Executing: claude --permission-mode ${claudeMode}`);
          ptyWrite(sessionId, `claude --permission-mode ${claudeMode}\n`)
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

    // 9. Cleanup on unmount or sessionId change
    return () => {
      console.log("Cleaning up terminal session:", sessionId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleResize);
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
      ptyClose(sessionId).catch(console.error);
      xterm.dispose();
    };
  }, [sessionId, workingDirectory, worktree, addToast, fontSize]);

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="border-b p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">Planning Terminal</h2>
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
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={isResetting}
          >
            {isResetting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RotateCw className="w-4 h-4 mr-2" />
            )}
            Reset Terminal
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel - Terminal */}
        <div className="flex-1 min-w-0 relative bg-[#1e1e1e]">
          {isResetting && (
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-10">
              <div className="text-center">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Resetting terminal...</p>
              </div>
            </div>
          )}
          <div ref={terminalRef} className="h-full w-full" />
        </div>

        {/* Right panel - Plan Display */}
        <div className="w-1/2 border-l border-border">
          <PlanDisplay 
            planSections={planSections} 
            onPlanEdit={handlePlanEdit}
            onExecutePlan={handleExecuteSection}
          />
        </div>
      </div>
    </div>
  );
};
