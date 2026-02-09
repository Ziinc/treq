import React, { memo, useCallback, useEffect, useMemo, useRef, useState, useImperativeHandle, forwardRef } from "react";
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
import { ChevronDown, ChevronUp, Bot, Terminal, Maximize2, Minimize2, GitBranch, Home } from "lucide-react";
import { useKeyboardShortcut } from "../hooks/useKeyboard";
import { ClaudeTerminalPanel } from "./terminal/ClaudeTerminalPanel";
import { ResizeDivider } from "./terminal/ResizeDivider";
import { ShellTerminalPanel } from "./terminal/ShellTerminalPanel";
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
  currentBranch?: string | null;
  // Claude terminal integration
  claudeSessions?: ClaudeSessionData[];
  activeClaudeSessionId?: number | null;
  onClaudeTerminalOutput?: (sessionId: number, output: string) => void;
  onClaudeTerminalIdle?: (sessionId: number) => void;
  // Callbacks for session management
  onActiveSessionChange?: (sessionId: number | null) => void;
  onCreateNewSession?: (activeWorkspacePath?: string | null) => void;
  onCloseSession?: (sessionId: number) => void;
  onRenameSession?: (sessionId: number, newName: string) => void;
  onNavigateToWorkspace?: (workspaceKey: string, isMainRepo: boolean) => void;
}

export interface WorkspaceTerminalPaneHandle {
  toggleCollapse: () => void;
  toggleMaximize: () => void;
  createAgentSession: () => void;
  createShellSession: () => void;
}

// Workspace group for rendering terminals grouped by workspace
interface WorkspaceGroup {
  workspaceKey: string;
  workspaceName: string;
  isMainRepo: boolean;
  terminals: Array<
    | { type: "shell"; data: ShellTerminalData }
    | { type: "claude"; data: ClaudeSessionData }
  >;
}

const WorkspaceTerminalPaneInner = forwardRef<WorkspaceTerminalPaneHandle, WorkspaceTerminalPaneProps>(
  function WorkspaceTerminalPane({
    workingDirectory,
    isHidden = false,
    onSessionError,
    currentBranch,
    claudeSessions = [],
    activeClaudeSessionId = null,
    onClaudeTerminalOutput,
    onClaudeTerminalIdle,
    onActiveSessionChange: _onActiveSessionChange,
    onCreateNewSession,
    onCloseSession,
    onRenameSession,
    onNavigateToWorkspace,
  }, ref) {
    // Shared pane state
    const [collapsed, setCollapsed] = useState(true);
    const [maximized, setMaximized] = useState(false);
    const [height, setHeight] = useState(33); // percentage
    const [isResizingHeight, setIsResizingHeight] = useState(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const paneRef = useRef<HTMLDivElement>(null);

    // Track which terminal is focused (last-clicked)
    const [activePtySessionId, setActivePtySessionId] = useState<string | null>(null);

    // Clear active terminal when clicking outside the pane
    useEffect(() => {
      const handleMouseDown = (e: MouseEvent) => {
        if (activePtySessionId && paneRef.current && !paneRef.current.contains(e.target as Node)) {
          setActivePtySessionId(null);
        }
      };
      document.addEventListener("mousedown", handleMouseDown);
      return () => document.removeEventListener("mousedown", handleMouseDown);
    }, [activePtySessionId]);

    // Track scroll container width for computing 40% min terminal width
    const [containerWidth, setContainerWidth] = useState(0);
    useEffect(() => {
      const el = scrollContainerRef.current;
      if (!el) return;
      // Set immediately so sticky headers work from first render
      setContainerWidth(el.clientWidth);
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setContainerWidth(entry.contentRect.width);
        }
      });
      ro.observe(el);
      return () => ro.disconnect();
    }, [collapsed]);

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

    // Scroll a specific terminal element into view after render
    const scrollToTerminal = useCallback((terminalId: string) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = scrollContainerRef.current?.querySelector(
            `[data-terminal-id="${CSS.escape(terminalId)}"]`
          );
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
          }
        });
      });
    }, []);

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

      // Scroll to the new terminal after it's rendered
      scrollToTerminal(claudeTerminalId);
    }, [activeClaudeSessionId]);

    // Derive the working directory for new terminals based on the active terminal's workspace.
    // Falls back to the sidebar-selected workspace (workingDirectory prop).
    const activeWorkspaceDir = useMemo(() => {
      if (!activePtySessionId) return null;

      // Check claude sessions
      const activeClaude = claudeSessions.find(s => s.ptySessionId === activePtySessionId);
      if (activeClaude) {
        return activeClaude.workspacePath || activeClaude.repoPath;
      }

      // Check shell terminals
      const activeShell = shellTerminals.find(s => s.id === activePtySessionId);
      if (activeShell) {
        return activeShell.workingDirectory;
      }

      return null;
    }, [activePtySessionId, claudeSessions, shellTerminals]);

    // Add new shell terminal in the active terminal's workspace, or sidebar-selected workspace
    const handleAddShell = useCallback(() => {
      const dir = activeWorkspaceDir || workingDirectory;
      const newId = `shell-${dir.replace(
        /[^a-zA-Z0-9]/g,
        "-"
      )}-${Date.now()}`;
      setShellTerminals((prev) => [...prev, { id: newId, workingDirectory: dir }]);
      // Add to terminal order (rightmost position)
      setTerminalOrder((prev) => [...prev, newId]);
      if (collapsed) {
        setCollapsed(false);
      }
      scrollToTerminal(newId);
    }, [activeWorkspaceDir, workingDirectory, collapsed, scrollToTerminal]);

    // Create Agent session in the active terminal's workspace, or sidebar-selected workspace
    const handleCreateAgentSession = useCallback(() => {
      onCreateNewSession?.(activeWorkspaceDir);
    }, [onCreateNewSession, activeWorkspaceDir]);

    // Close shell terminal
    const handleCloseShell = useCallback((terminalId: string) => {
      ptyClose(terminalId).catch(console.error);
      terminalRefs.current.delete(terminalId);
      setShellTerminals((prev) => prev.filter((t) => t.id !== terminalId));
      setTerminalOrder((prev) => prev.filter((id) => id !== terminalId));
      if (activePtySessionId === terminalId) {
        setActivePtySessionId(null);
      }
    }, [activePtySessionId]);

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
        if (activeClaudeSessionId === sessionId) {
          _onActiveSessionChange?.(null);
        }
        if (activePtySessionId === claudeTerminalId) {
          setActivePtySessionId(null);
        }
      },
      [claudeSessions, onCloseSession, activeClaudeSessionId, _onActiveSessionChange, activePtySessionId]
    );

    // Expose methods via ref for command palette
    useImperativeHandle(ref, () => ({
      toggleCollapse: () => setCollapsed((prev) => !prev),
      toggleMaximize: () => {
        if (maximized) {
          setMaximized(false);
        } else {
          setCollapsed(false);
          setMaximized(true);
        }
      },
      createAgentSession: handleCreateAgentSession,
      createShellSession: handleAddShell,
    }), [maximized, handleCreateAgentSession, handleAddShell]);

    // Height resize handlers
    const handleHeightResizeMouseDown = useCallback((e: React.MouseEvent) => {
      if (maximized) return; // Don't allow resize when maximized
      e.preventDefault();
      setIsResizingHeight(true);
    }, [maximized]);

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

          // Minimum width is 2/5 of scroll container viewport
          const minWidth = containerWidth * 0.4 || 300;

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
          if (newLeftWidth < minWidth) {
            const diff = minWidth - newLeftWidth;
            newLeftWidth = minWidth;
            newRightWidth -= diff;
          }
          if (newRightWidth < minWidth) {
            const diff = minWidth - newRightWidth;
            newRightWidth = minWidth;
            newLeftWidth -= diff;
          }

          // Don't update if either would be below minimum
          if (newLeftWidth < minWidth || newRightWidth < minWidth) {
            return prev;
          }

          newWidths.set(leftId, newLeftWidth);
          newWidths.set(rightId, newRightWidth);

          return newWidths;
        });
      },
      []
    );

    // Show ALL mounted Claude sessions (no workspace filtering)
    const claudeSessionsToRender = claudeSessions.filter((s) => {
      const isActiveSession = activeClaudeSessionId === s.sessionId;
      return isActiveSession || mountedClaudeSessions.has(s.sessionId);
    });

    // Show all shell terminals (no workspace filtering)
    const allShellTerminals = shellTerminals;

    // Cmd+J: Toggle bottom terminal pane
    useKeyboardShortcut(
      "j",
      true,
      () => {
        if (isHidden) return;
        setCollapsed((prev) => !prev);
      },
      [isHidden]
    );

    // Cmd+Control+J: Toggle maximize/restore terminal pane
    useKeyboardShortcut(
      "j",
      true,
      () => {
        if (isHidden) return;

        if (maximized) {
          // If already maximized, restore to expanded state
          setMaximized(false);
        } else {
          // If collapsed or expanded, maximize
          setCollapsed(false);
          setMaximized(true);
        }
      },
      [isHidden, maximized],
      { requireBothCmdAndCtrl: true }
    );

    // Cmd+]: Create new agent terminal
    useKeyboardShortcut(
      "]",
      true,
      () => {
        if (isHidden) return;
        handleCreateAgentSession();
      },
      [isHidden, handleCreateAgentSession]
    );

    // Cmd+\: Create new shell terminal
    useKeyboardShortcut(
      "\\",
      true,
      () => {
        if (isHidden) return;
        handleAddShell();
      },
      [isHidden, handleAddShell]
    );

    // Build ordered list of all terminals for rendering based on terminalOrder
    const shellTerminalMap = new Map(
      allShellTerminals.map((t) => [t.id, t])
    );
    const claudeSessionMap = new Map(
      claudeSessionsToRender.map((s) => [`claude-${s.sessionId}`, s])
    );

    const orderedTerminals: Array<
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

    // Ensure newly created Claude sessions render immediately even before their IDs
    // are added to terminalOrder (e.g., pending agent sessions).
    const missingClaudeTerminals = claudeSessionsToRender
      .filter(
        (session) => !terminalOrder.includes(`claude-${session.sessionId}`)
      )
      .map((session) => ({ type: "claude" as const, data: session }));

    const allTerminals = [...orderedTerminals, ...missingClaudeTerminals];

    // Group terminals by workspace
    const workspaceGroups = useMemo((): WorkspaceGroup[] => {
      const groupMap = new Map<string, WorkspaceGroup>();

      for (const terminal of allTerminals) {
        let workspaceKey: string;
        let workspaceName: string;

        if (terminal.type === "claude") {
          workspaceKey = terminal.data.workspacePath || terminal.data.repoPath;
          workspaceName = terminal.data.workspaceName || "Main Repository";
        } else {
          // Shell terminal - derive workspace info from workingDirectory
          // Try to find a matching Claude session's workspace info for this directory
          const matchingClaude = claudeSessions.find((s) => {
            const sessionDir = s.workspacePath || s.repoPath;
            return sessionDir === terminal.data.workingDirectory;
          });
          workspaceKey = terminal.data.workingDirectory;
          workspaceName = matchingClaude?.workspaceName || "Main Repository";
        }

        if (!groupMap.has(workspaceKey)) {
          groupMap.set(workspaceKey, {
            workspaceKey,
            workspaceName,
            isMainRepo: workspaceName === "Main Repository",
            terminals: [],
          });
        }
        groupMap.get(workspaceKey)!.terminals.push(terminal);
      }

      return Array.from(groupMap.values());
    }, [allTerminals, claudeSessions]);

    // Scroll to workspace group and focus first terminal when workingDirectory changes
    useEffect(() => {
      if (collapsed || isHidden || !scrollContainerRef.current) return;
      const matchingGroup = workspaceGroups.find(
        (g) => g.workspaceKey === workingDirectory
      );
      if (!matchingGroup || matchingGroup.terminals.length === 0) return;

      // Scroll the group element into view
      requestAnimationFrame(() => {
        const groupEl = scrollContainerRef.current?.querySelector(
          `[data-workspace-group="${CSS.escape(matchingGroup.workspaceKey)}"]`
        );
        if (groupEl) {
          groupEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
        }
      });

      // Set the first terminal in the group as active
      const firstTerminal = matchingGroup.terminals[0];
      if (firstTerminal.type === "shell") {
        setActivePtySessionId(firstTerminal.data.id);
      } else {
        setActivePtySessionId(firstTerminal.data.ptySessionId);
      }
    }, [workingDirectory]); // eslint-disable-line react-hooks/exhaustive-deps

    // When completely hidden, render terminals in hidden div to keep PTY sessions alive
    if (isHidden) {
      return (
        <div className="hidden">
          {allShellTerminals.map((terminal) => (
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
      <div ref={paneRef} style={{ display: 'contents' }}>
        {/* Resize handle - only when expanded and not maximized */}
        {!collapsed && !maximized && (
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
            height: collapsed ? 32 : maximized ? "100%" : `${height}%`,
            maxHeight: collapsed ? 32 : maximized ? "100%" : "60%",
          }}
        >
          {/* Pane Header */}
          <div className="h-8 min-h-[32px] flex items-center justify-between px-2 border-b bg-muted/30 flex-shrink-0">
            <div className="flex items-center gap-2 font-medium text-muted-foreground">
              <Terminal className="w-3.5 h-3.5" />
              <span>Terminals</span>
              {totalTerminals > 0 && (
                <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                  {totalTerminals}
                </span>
              )}
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
                  <TooltipContent>New Agent Session (⌘+])</TooltipContent>
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
                  <TooltipContent>New Shell (⌘+\)</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {/* Expand/Maximize/Restore button */}
              {collapsed && totalTerminals > 0 ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        onClick={() => setCollapsed(false)}
                        variant="ghost"
                        className="h-5 w-5 rounded-sm p-0"
                        aria-label="Expand terminal"
                      >
                        <ChevronUp className="w-3 h-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Expand (⌘+J)</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : maximized ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        onClick={() => setMaximized(false)}
                        variant="ghost"
                        className="h-5 w-5 rounded-sm p-0"
                        aria-label="Restore terminal"
                      >
                        <Minimize2 className="w-3 h-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Restore</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        onClick={() => setMaximized(true)}
                        variant="ghost"
                        className="h-5 w-5 rounded-sm p-0"
                        aria-label="Maximize terminal"
                      >
                        <Maximize2 className="w-3 h-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Maximize (⌘+⌃+J)</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {/* Collapse button (always visible when not collapsed) */}
              {!collapsed && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        onClick={() => {
                          setCollapsed(true);
                          setMaximized(false);
                        }}
                        variant="ghost"
                        className="h-5 w-5 rounded-sm p-0"
                        aria-label="Collapse terminal"
                      >
                        <ChevronDown className="w-3 h-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Collapse (⌘+J)</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
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
              {workspaceGroups.map((group, groupIndex) => {
                // Each terminal gets min 40% of scroll container viewport width
                const minTerminalPx = containerWidth * 0.4 || 300;
                const groupMinWidth = group.terminals.length * minTerminalPx;
                return (
                <div key={group.workspaceKey} data-workspace-group={group.workspaceKey} className={cn("flex flex-col min-h-0 flex-shrink-0", groupIndex > 0 && "border-l-2 border-border")} style={{ minWidth: groupMinWidth, flex: "1 0 auto" }}>
                  {/* Horizontal workspace indicator header - sticky so it stays visible when scrolling */}
                  <div
                    className="h-8 flex items-center gap-2 px-2 border-b border-border bg-muted/20 flex-shrink-0 sticky left-0 z-10 overflow-hidden cursor-pointer hover:bg-muted/40 transition-colors"
                    style={{ width: containerWidth > 0 ? containerWidth : undefined }}
                    onClick={() => onNavigateToWorkspace?.(group.workspaceKey, group.isMainRepo)}
                  >
                    {group.isMainRepo ? (
                      <Home className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <GitBranch className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    )}
                    <span
                      className="text-sm text-muted-foreground font-mono truncate"
                      title={group.isMainRepo ? (currentBranch || "main") : group.workspaceName}
                    >
                      {group.isMainRepo ? (currentBranch || "main") : group.workspaceName}
                    </span>
                  </div>
                  {/* Terminals in this group */}
                  <div className="flex min-h-0 flex-1">
                    {group.terminals.map((terminal, index) => {
                      const isLastInGroup = index === group.terminals.length - 1;
                      const nextTerminal = group.terminals[index + 1];

                      if (terminal.type === "shell") {
                        const terminalId = terminal.data.id;
                        return (
                          <React.Fragment key={terminalId}>
                            <ShellTerminalPanel
                              terminalData={terminal.data}
                              collapsed={collapsed}
                              isActive={activePtySessionId === terminalId}
                              onFocus={() => setActivePtySessionId(terminalId)}
                              onClose={() => handleCloseShell(terminalId)}
                              canClose={true}
                              onSessionError={onSessionError}
                              terminalRefs={terminalRefs}
                              width={terminalWidths.get(terminalId)}
                            />
                            {!isLastInGroup && nextTerminal && (
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
                        const ptyId = terminal.data.ptySessionId;
                        return (
                          <React.Fragment key={terminalId}>
                            <ClaudeTerminalPanel
                              sessionData={terminal.data}
                              collapsed={collapsed}
                              isActive={activePtySessionId === ptyId}
                              onFocus={() => setActivePtySessionId(ptyId)}
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
                            {!isLastInGroup && nextTerminal && (
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
                </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }
);

export const WorkspaceTerminalPane = memo(WorkspaceTerminalPaneInner);
