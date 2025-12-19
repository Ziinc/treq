import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  type ConsolidatedTerminalHandle,
} from "./ConsolidatedTerminal";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";
import { ptyClose } from "../lib/api";
import { ChevronDown, ChevronUp, Bot, Terminal } from "lucide-react";
import { useKeyboardShortcut } from "../hooks/useKeyboard";
import { ClaudeTerminalPanel } from "./terminal/ClaudeTerminalPanel";
import { ResizeDivider } from "./terminal/ResizeDivider";
import { ShellTerminalPanel } from "./terminal/ShellTerminalPanel";
import { MIN_TERMINAL_WIDTH } from "./terminal/types";
import { type ClaudeSessionData } from "./terminal/types";

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
    const [terminalWidths, setTerminalWidths] = useState<
      Map<string, number | null>
    >(new Map());

    // Shared refs for all terminals
    const terminalRefs = useRef<Map<string, ConsolidatedTerminalHandle | null>>(
      new Map()
    );


    // Auto-mount active session when it changes (after creation or selection)
    useEffect(() => {
      if (activeClaudeSessionId === null) return;

      const claudeTerminalId = `claude-${activeClaudeSessionId}`;

      setMountedClaudeSessions((prev) => {
        if (prev.has(activeClaudeSessionId)) return prev;
        const next = new Set(prev);
        next.add(activeClaudeSessionId);
        return next;
      });

      setTerminalOrder((prev) => {
        if (prev.includes(claudeTerminalId)) return prev;
        return [...prev, claudeTerminalId];
      });

      setCollapsed(false);
    }, [activeClaudeSessionId]);

    // Scroll to the right when new terminal is added
    useEffect(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollLeft =
          scrollContainerRef.current.scrollWidth;
      }
    }, [shellTerminals.length, mountedClaudeSessions.size]);

    // Collapse pane when switching to a workspace with no terminals
    useEffect(() => {
      // Calculate terminals for this workspace
      const claudeForWorkspace = claudeSessions.filter((s) => {
        if (!mountedClaudeSessions.has(s.sessionId)) return false;
        const sessionWorkingDir = s.workspacePath || s.repoPath;
        return sessionWorkingDir === workingDirectory;
      });
      const shellsForWorkspace = shellTerminals.filter(
        (t) => t.workingDirectory === workingDirectory
      );

      if (claudeForWorkspace.length === 0 && shellsForWorkspace.length === 0) {
        setCollapsed(true);
      }
    }, [workingDirectory, claudeSessions, shellTerminals, mountedClaudeSessions]);

    // Add new shell terminal
    const handleAddShell = useCallback(() => {
      const newId = `shell-${workingDirectory.replace(
        /[^a-zA-Z0-9]/g,
        "-"
      )}-${Date.now()}`;
      setShellTerminals((prev) => [...prev, { id: newId, workingDirectory }]);
      // Add to terminal order (rightmost position)
      setTerminalOrder((prev) => [...prev, newId]);
      if (collapsed) {
        setCollapsed(false);
      }
    }, [workingDirectory, collapsed]);

    // Create Agent session - creates a new Claude session
    const handleCreateAgentSession = useCallback(() => {
      onCreateNewSession?.();
    }, [onCreateNewSession]);

    // Close shell terminal
    const handleCloseShell = useCallback((terminalId: string) => {
      ptyClose(terminalId).catch(console.error);
      terminalRefs.current.delete(terminalId);
      setShellTerminals((prev) => prev.filter((t) => t.id !== terminalId));
      setTerminalOrder((prev) => prev.filter((id) => id !== terminalId));
    }, []);

    // Close Claude session
    const handleCloseClaudeSession = useCallback(
      (sessionId: number) => {
        const claudeTerminalId = `claude-${sessionId}`;
        const sessionData = claudeSessions.find(
          (s) => s.sessionId === sessionId
        );
        if (sessionData) {
          ptyClose(sessionData.ptySessionId).catch(console.error);
          terminalRefs.current.delete(claudeTerminalId);
        }
        setMountedClaudeSessions((prev) => {
          const next = new Set(prev);
          next.delete(sessionId);
          return next;
        });
        setTerminalOrder((prev) =>
          prev.filter((id) => id !== claudeTerminalId)
        );
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
          const leftEl = container.querySelector(
            `[data-terminal-id="${leftId}"]`
          ) as HTMLElement | null;
          const rightEl = container.querySelector(
            `[data-terminal-id="${rightId}"]`
          ) as HTMLElement | null;

          if (!leftEl || !rightEl) return prev;

          const leftCurrentWidth =
            prev.get(leftId) ?? leftEl.getBoundingClientRect().width;
          const rightCurrentWidth =
            prev.get(rightId) ?? rightEl.getBoundingClientRect().width;

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
          if (
            newLeftWidth < MIN_TERMINAL_WIDTH ||
            newRightWidth < MIN_TERMINAL_WIDTH
          ) {
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
    const shellTerminalMap = new Map(
      shellTerminalsForWorkspace.map((t) => [t.id, t])
    );
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
      .filter((t): t is NonNullable<typeof t> => t !== null);

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
            <div className="flex items-center gap-2 font-medium text-muted-foreground">
              <Terminal className="w-3.5 h-3.5" />
              <span>Terminals</span>
            </div>

            <div className="flex items-center gap-2">
              {/* New Agent button */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      onClick={handleCreateAgentSession}
                      variant={totalTerminals === 0 ? "default" : "ghost"}
                      className={cn(
                        "h-6 px-2 rounded-sm gap-1",
                        totalTerminals === 0
                          ? ""
                          : "text-muted-foreground hover:text-foreground"
                      )}
                      aria-label="New Agent"
                    >
                      <Bot className="w-4 h-4" />
                        Agent
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>New Agent Session</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {/* New Shell button */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      onClick={handleAddShell}
                      variant="ghost"
                      className="h-6 px-2 rounded-sm gap-1 text-muted-foreground hover:text-foreground"
                      aria-label="New Shell"
                    >
                      <Terminal className="w-4 h-4" /> Shell
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>New Shell</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {/* Collapse/Expand button */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      onClick={() => setCollapsed(!collapsed)}
                      variant="ghost"
                      className="h-5 w-5 rounded-sm p-0"
                      aria-label={
                        collapsed ? "Expand terminal" : "Collapse terminal"
                      }
                    >
                      {collapsed ? (
                        <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </Button>
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
                            const nextId =
                              nextTerminal.type === "shell"
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
                            ? (newName) =>
                                onRenameSession(
                                  terminal.data.sessionId,
                                  newName
                                )
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
                            const nextId =
                              nextTerminal.type === "shell"
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
