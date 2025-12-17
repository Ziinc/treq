import React, {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ConsolidatedTerminal,
  type ConsolidatedTerminalHandle,
} from "./ConsolidatedTerminal";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { cn } from "../lib/utils";
import { ptyClose } from "../lib/api";
import {
  ChevronDown,
  ChevronUp,
  Bot,
  Terminal,
  Plus,
  X,
} from "lucide-react";
import { useKeyboardShortcut } from "../hooks/useKeyboard";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  ClaudeTerminalPanel
} from "./terminal/ClaudeTerminalPanel";
import { MIN_TERMINAL_WIDTH } from "./terminal/types";
import { type ClaudeSessionData } from "./terminal/types";

// Resize divider between terminal panels
interface ResizeDividerProps {
  onResize: (deltaX: number) => void;
}

const ResizeDivider = memo<ResizeDividerProps>(function ResizeDivider({
  onResize,
}) {
  const [isDragging, setIsDragging] = useState(false);
  const lastXRef = useRef<number>(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    lastXRef.current = e.clientX;
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - lastXRef.current;
      lastXRef.current = e.clientX;
      onResize(deltaX);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, onResize]);

  // Set cursor during drag
  useEffect(() => {
    if (isDragging) {
      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";
    } else {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
  }, [isDragging]);

  return (
    <div
      className="relative flex-shrink-0 w-1 group cursor-ew-resize"
      onMouseDown={handleMouseDown}
    >
      <div
        className={cn(
          "absolute inset-y-0 left-0 w-1 bg-border transition-colors",
          "group-hover:bg-primary/50",
          isDragging && "bg-primary"
        )}
      />
      <div className="absolute inset-y-0 -left-1 w-3 cursor-ew-resize" />
    </div>
  );
});

// Shell terminal data
interface ShellTerminalData {
  id: string;
  workingDirectory: string;
}

interface WorkspaceTerminalPaneProps {
  workingDirectory: string;
  isHidden?: boolean;
  onSessionError?: (message: string) => void;
  // Claude terminal integration
  claudeSessions?: ClaudeSessionData[];
  activeClaudeSessionId?: number | null;
  onClaudeTerminalOutput?: (sessionId: number, output: string) => void;
  onClaudeTerminalIdle?: (sessionId: number) => void;
  // Callbacks for session management
  onActiveSessionChange?: (sessionId: number | null) => void;
  onCreateNewSession?: () => void;
  onCloseSession?: (sessionId: number) => void;
  onRenameSession?: (sessionId: number, newName: string) => void;
}

// Shell terminal panel with header
interface ShellTerminalPanelProps {
  terminalData: ShellTerminalData;
  collapsed: boolean;
  onClose?: () => void;
  canClose: boolean;
  onSessionError?: (message: string) => void;
  terminalRefs: React.MutableRefObject<
    Map<string, ConsolidatedTerminalHandle | null>
  >;
  width?: number | null;
}

const ShellTerminalPanel = memo<ShellTerminalPanelProps>(
  function ShellTerminalPanel({
    terminalData,
    collapsed,
    onClose,
    canClose,
    onSessionError,
    terminalRefs,
    width,
  }) {
    const isHidden = collapsed;

    return (
      <div
        data-terminal-id={terminalData.id}
        className={cn(
          "flex flex-col min-h-0 overflow-hidden flex-shrink-0",
          width == null && "flex-1"
        )}
        style={{
          minWidth: MIN_TERMINAL_WIDTH,
          width: width != null ? width : undefined,
        }}
      >
        {/* Header */}
        <div className="h-7 min-h-[28px] flex items-center justify-between px-2 bg-background border-b border-r border-border flex-shrink-0">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground min-w-0">
            <Terminal className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">Shell</span>
          </div>
          {canClose && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={onClose}
                    className="h-4 w-4 rounded-sm hover:bg-muted flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity"
                    aria-label="Close shell"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Close</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        {/* Terminal */}
        <div className="flex-1 min-h-0 overflow-hidden border-r border-border" style={{ backgroundColor: "#1e1e1e" }}>
          <ConsolidatedTerminal
            ref={(el) => {
              if (el) {
                terminalRefs.current.set(terminalData.id, el);
              } else {
                terminalRefs.current.delete(terminalData.id);
              }
            }}
            sessionId={terminalData.id}
            workingDirectory={terminalData.workingDirectory}
            onSessionError={onSessionError}
            containerClassName="h-full w-full overflow-hidden"
            terminalPaneClassName="w-full h-full"
            isHidden={isHidden}
          />
        </div>
      </div>
    );
  }
);

export const WorkspaceTerminalPane = memo<WorkspaceTerminalPaneProps>(
  function WorkspaceTerminalPane({
    workingDirectory,
    isHidden = false,
    onSessionError,
    claudeSessions = [],
    activeClaudeSessionId = null,
    onClaudeTerminalOutput,
    onClaudeTerminalIdle,
    onActiveSessionChange: _onActiveSessionChange,
    onCreateNewSession,
    onCloseSession,
    onRenameSession,
  }) {
    // Shared pane state
    const [collapsed, setCollapsed] = useState(true);
    const [height, setHeight] = useState(33); // percentage
    const [isResizingHeight, setIsResizingHeight] = useState(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Shell terminals - start empty (agent sessions are opened by default instead)
    const [shellTerminals, setShellTerminals] = useState<ShellTerminalData[]>(
      []
    );

    // Track mounted Claude sessions to keep them alive
    const [mountedClaudeSessions, setMountedClaudeSessions] = useState<
      Set<number>
    >(new Set());

    // Track order of all terminals (shell and claude) by their IDs
    const [terminalOrder, setTerminalOrder] = useState<string[]>([]);

    // Track terminal widths by ID (null means flex-1, number is fixed pixel width)
    const [terminalWidths, setTerminalWidths] = useState<Map<string, number | null>>(new Map());

    // Shared refs for all terminals
    const terminalRefs = useRef<
      Map<string, ConsolidatedTerminalHandle | null>
    >(new Map());

    // Track shell terminal IDs in a ref for cleanup on unmount
    const shellTerminalIdsRef = useRef<string[]>(shellTerminals.map((t) => t.id));
    useEffect(() => {
      shellTerminalIdsRef.current = shellTerminals.map((t) => t.id);
    }, [shellTerminals]);

    // Cleanup all shell terminal PTYs on unmount only
    useEffect(() => {
      return () => {
        shellTerminalIdsRef.current.forEach((id) => {
          ptyClose(id).catch(console.error);
        });
      };
    }, []);

    // Track mounted Claude sessions when activeClaudeSessionId changes
    useEffect(() => {
      if (activeClaudeSessionId !== null) {
        const claudeTerminalId = `claude-${activeClaudeSessionId}`;
        const isNewSession = !mountedClaudeSessions.has(activeClaudeSessionId);

        setMountedClaudeSessions((prev) => {
          if (prev.has(activeClaudeSessionId)) return prev;
          const next = new Set(prev);
          next.add(activeClaudeSessionId);
          return next;
        });
        // Add to terminal order if not already present
        setTerminalOrder((prev) => {
          if (prev.includes(claudeTerminalId)) return prev;
          return [...prev, claudeTerminalId];
        });
        // Expand pane only when a NEW session is activated
        if (isNewSession) {
          setCollapsed(false);
        }
      }
    }, [activeClaudeSessionId]);

    // Scroll to the right when new terminal is added
    useEffect(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollLeft =
          scrollContainerRef.current.scrollWidth;
      }
    }, [shellTerminals.length, mountedClaudeSessions.size]);

    // Add new shell terminal
    const handleAddShell = useCallback(() => {
      const newId = `shell-${workingDirectory.replace(/[^a-zA-Z0-9]/g, "-")}-${Date.now()}`;
      setShellTerminals((prev) => [
        ...prev,
        { id: newId, workingDirectory },
      ]);
      // Add to terminal order (rightmost position)
      setTerminalOrder((prev) => [...prev, newId]);
      if (collapsed) {
        setCollapsed(false);
      }
    }, [workingDirectory, collapsed]);

    // Close shell terminal
    const handleCloseShell = useCallback(
      (terminalId: string) => {
        ptyClose(terminalId).catch(console.error);
        terminalRefs.current.delete(terminalId);
        setShellTerminals((prev) => prev.filter((t) => t.id !== terminalId));
        setTerminalOrder((prev) => prev.filter((id) => id !== terminalId));
      },
      []
    );

    // Close Claude session
    const handleCloseClaudeSession = useCallback(
      (sessionId: number) => {
        const claudeTerminalId = `claude-${sessionId}`;
        const sessionData = claudeSessions.find((s) => s.sessionId === sessionId);
        if (sessionData) {
          ptyClose(sessionData.ptySessionId).catch(console.error);
          terminalRefs.current.delete(claudeTerminalId);
        }
        setMountedClaudeSessions((prev) => {
          const next = new Set(prev);
          next.delete(sessionId);
          return next;
        });
        setTerminalOrder((prev) => prev.filter((id) => id !== claudeTerminalId));
        onCloseSession?.(sessionId);
      },
      [claudeSessions, onCloseSession]
    );

    // Height resize handlers
    const handleHeightResizeMouseDown = useCallback((e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizingHeight(true);
    }, []);

    useEffect(() => {
      if (!isResizingHeight) return;

      const handleMouseMove = (e: MouseEvent) => {
        const container = document.querySelector(
          ".workspace-terminal-container"
        );
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const distanceFromBottom = rect.bottom - e.clientY;
        const newHeightPercent = (distanceFromBottom / rect.height) * 100;
        setHeight(Math.max(15, Math.min(60, newHeightPercent)));
      };

      const handleMouseUp = () => setIsResizingHeight(false);

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }, [isResizingHeight]);

    // Set cursor during height drag
    useEffect(() => {
      if (isResizingHeight) {
        document.body.style.cursor = "ns-resize";
        document.body.style.userSelect = "none";
      } else {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    }, [isResizingHeight]);

    // Terminal width resize handler
    const handleTerminalResize = useCallback(
      (leftId: string, rightId: string, deltaX: number) => {
        if (!scrollContainerRef.current) return;

        setTerminalWidths((prev) => {
          const newWidths = new Map(prev);
          const container = scrollContainerRef.current;
          if (!container) return prev;

          // Get current widths - if null, calculate from actual element width
          const leftEl = container.querySelector(`[data-terminal-id="${leftId}"]`) as HTMLElement | null;
          const rightEl = container.querySelector(`[data-terminal-id="${rightId}"]`) as HTMLElement | null;

          if (!leftEl || !rightEl) return prev;

          const leftCurrentWidth = prev.get(leftId) ?? leftEl.getBoundingClientRect().width;
          const rightCurrentWidth = prev.get(rightId) ?? rightEl.getBoundingClientRect().width;

          // Calculate new widths
          let newLeftWidth = leftCurrentWidth + deltaX;
          let newRightWidth = rightCurrentWidth - deltaX;

          // Enforce minimum widths
          if (newLeftWidth < MIN_TERMINAL_WIDTH) {
            const diff = MIN_TERMINAL_WIDTH - newLeftWidth;
            newLeftWidth = MIN_TERMINAL_WIDTH;
            newRightWidth -= diff;
          }
          if (newRightWidth < MIN_TERMINAL_WIDTH) {
            const diff = MIN_TERMINAL_WIDTH - newRightWidth;
            newRightWidth = MIN_TERMINAL_WIDTH;
            newLeftWidth -= diff;
          }

          // Don't update if either would be below minimum
          if (newLeftWidth < MIN_TERMINAL_WIDTH || newRightWidth < MIN_TERMINAL_WIDTH) {
            return prev;
          }

          newWidths.set(leftId, newLeftWidth);
          newWidths.set(rightId, newRightWidth);

          return newWidths;
        });
      },
      []
    );

    // Cmd+`: Toggle bottom terminal pane
    useKeyboardShortcut(
      "`",
      true,
      () => {
        if (isHidden) return;
        setCollapsed((prev) => !prev);
      },
      [isHidden]
    );

    // Get Claude sessions that should be rendered (mounted ones for this workspace)
    const claudeSessionsToRender = claudeSessions.filter((s) => {
      if (!mountedClaudeSessions.has(s.sessionId)) return false;
      // Filter by workspace: match workspacePath if set, otherwise match repoPath
      const sessionWorkingDir = s.workspacePath || s.repoPath;
      return sessionWorkingDir === workingDirectory;
    });

    // Filter shell terminals for this workspace
    const shellTerminalsForWorkspace = shellTerminals.filter(
      (t) => t.workingDirectory === workingDirectory
    );

    // Build ordered list of all terminals for rendering based on terminalOrder
    const shellTerminalMap = new Map(shellTerminalsForWorkspace.map((t) => [t.id, t]));
    const claudeSessionMap = new Map(
      claudeSessionsToRender.map((s) => [`claude-${s.sessionId}`, s])
    );

    const allTerminals: Array<
      | { type: "shell"; data: ShellTerminalData }
      | { type: "claude"; data: ClaudeSessionData }
    > = terminalOrder
      .map((id) => {
        if (id.startsWith("shell-")) {
          const shellData = shellTerminalMap.get(id);
          if (shellData) {
            return { type: "shell" as const, data: shellData };
          }
        } else if (id.startsWith("claude-")) {
          const claudeData = claudeSessionMap.get(id);
          if (claudeData) {
            return { type: "claude" as const, data: claudeData };
          }
        }
        return null;
      })
      .filter(
        (t): t is NonNullable<typeof t> => t !== null
      );

    // When completely hidden, render terminals in hidden div to keep PTY sessions alive
    if (isHidden) {
      return (
        <div className="hidden">
          {shellTerminalsForWorkspace.map((terminal) => (
            <ShellTerminalPanel
              key={terminal.id}
              terminalData={terminal}
              collapsed={true}
              canClose={false}
              onSessionError={onSessionError}
              terminalRefs={terminalRefs}
            />
          ))}
          {claudeSessionsToRender.map((sessionData) => (
            <ClaudeTerminalPanel
              key={sessionData.sessionId}
              sessionData={sessionData}
              collapsed={true}
              onSessionError={onSessionError}
              onRename={
                onRenameSession
                  ? (newName) => onRenameSession(sessionData.sessionId, newName)
                  : undefined
              }
              terminalRefs={terminalRefs}
            />
          ))}
        </div>
      );
    }

    const totalTerminals = allTerminals.length;

    return (
      <>
        {/* Resize handle - only when expanded */}
        {!collapsed && (
          <div
            className="relative flex-shrink-0 h-1 group"
            onMouseDown={handleHeightResizeMouseDown}
          >
            <div
              className={cn(
                "absolute inset-x-0 top-0 h-1 bg-border transition-colors",
                "group-hover:bg-primary/50",
                isResizingHeight && "bg-primary"
              )}
            />
            <div className="absolute inset-x-0 -top-1 h-3 cursor-ns-resize" />
          </div>
        )}

        {/* Bottom Terminal Pane */}
        <div
          className="flex flex-col border-t bg-background flex-shrink-0 overflow-hidden"
          style={{
            height: collapsed ? 32 : `${height}%`,
            maxHeight: collapsed ? 32 : "60%",
          }}
        >
          {/* Pane Header */}
          <div className="h-8 min-h-[32px] flex items-center justify-between px-2 border-b bg-muted/30 flex-shrink-0">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Terminal className="w-3.5 h-3.5" />
              <span>Terminals ({totalTerminals})</span>
            </div>

            <div className="flex items-center gap-1">
              {/* Add new terminal dropdown */}
              {!collapsed && (
                <DropdownMenu>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="h-5 w-5 rounded-sm hover:bg-muted flex items-center justify-center"
                            aria-label="New terminal"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </DropdownMenuTrigger>
                      </TooltipTrigger>
                      <TooltipContent>New Terminal</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <DropdownMenuContent align="end" sideOffset={4}>
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        onCreateNewSession?.();
                      }}
                    >
                      <Bot className="w-3 h-3 mr-2" />
                      New Agent Session
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        handleAddShell();
                      }}
                    >
                      <Terminal className="w-3 h-3 mr-2" />
                      New Shell
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {/* Collapse/Expand button */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setCollapsed(!collapsed)}
                      className="h-5 w-5 rounded-sm hover:bg-muted flex items-center justify-center"
                      aria-label={
                        collapsed ? "Expand terminal" : "Collapse terminal"
                      }
                    >
                      {collapsed ? (
                        <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {collapsed ? "Expand (⌘+`)" : "Collapse (⌘+`)"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          {/* Terminal Content - fills width, scrolls horizontally when needed */}
          {!collapsed && (
            <div
              ref={scrollContainerRef}
              className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden flex"
              style={{
                backgroundColor: "#1e1e1e",
              }}
            >
              {allTerminals.map((terminal, index) => {
                const isLastTerminal = index === allTerminals.length - 1;
                const nextTerminal = allTerminals[index + 1];

                if (terminal.type === "shell") {
                  const terminalId = terminal.data.id;
                  return (
                    <React.Fragment key={terminalId}>
                      <ShellTerminalPanel
                        terminalData={terminal.data}
                        collapsed={collapsed}
                        onClose={() => handleCloseShell(terminalId)}
                        canClose={true}
                        onSessionError={onSessionError}
                        terminalRefs={terminalRefs}
                        width={terminalWidths.get(terminalId)}
                      />
                      {!isLastTerminal && nextTerminal && (
                        <ResizeDivider
                          onResize={(deltaX) => {
                            const nextId = nextTerminal.type === "shell"
                              ? nextTerminal.data.id
                              : `claude-${nextTerminal.data.sessionId}`;
                            handleTerminalResize(terminalId, nextId, deltaX);
                          }}
                        />
                      )}
                    </React.Fragment>
                  );
                } else {
                  const terminalId = `claude-${terminal.data.sessionId}`;
                  return (
                    <React.Fragment key={terminalId}>
                      <ClaudeTerminalPanel
                        sessionData={terminal.data}
                        collapsed={collapsed}
                        onClose={() =>
                          handleCloseClaudeSession(terminal.data.sessionId)
                        }
                        onRename={
                          onRenameSession
                            ? (newName) => onRenameSession(terminal.data.sessionId, newName)
                            : undefined
                        }
                        onSessionError={onSessionError}
                        onTerminalOutput={
                          onClaudeTerminalOutput
                            ? (output) =>
                                onClaudeTerminalOutput(
                                  terminal.data.sessionId,
                                  output
                                )
                            : undefined
                        }
                        onTerminalIdle={
                          onClaudeTerminalIdle
                            ? () =>
                                onClaudeTerminalIdle(terminal.data.sessionId)
                            : undefined
                        }
                        terminalRefs={terminalRefs}
                        width={terminalWidths.get(terminalId)}
                      />
                      {!isLastTerminal && nextTerminal && (
                        <ResizeDivider
                          onResize={(deltaX) => {
                            const nextId = nextTerminal.type === "shell"
                              ? nextTerminal.data.id
                              : `claude-${nextTerminal.data.sessionId}`;
                            handleTerminalResize(terminalId, nextId, deltaX);
                          }}
                        />
                      )}
                    </React.Fragment>
                  );
                }
              })}
            </div>
          )}
        </div>
      </>
    );
  }
);
