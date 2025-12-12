import React, {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
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
import { ptyClose, setSessionModel, getSessionModel, updateSessionName } from "../lib/api";
import {
  ChevronDown,
  ChevronUp,
  X,
  Search,
  RotateCw,
  Loader2,
  Bot,
  Terminal,
  Plus,
} from "lucide-react";
import { useKeyboardShortcut } from "../hooks/useKeyboard";
import { ModelSelector } from "./ModelSelector";
import { Input } from "./ui/input";
import { useToast } from "./ui/toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

// Minimum width for each terminal panel (used when multiple terminals)
const MIN_TERMINAL_WIDTH = 300;

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

// Claude session data passed from Dashboard
export interface ClaudeSessionData {
  sessionId: number;
  sessionName: string;
  ptySessionId: string;
  workspacePath: string | null;
  repoPath: string;
}

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

// Claude terminal panel with header
interface ClaudeTerminalPanelProps {
  sessionData: ClaudeSessionData;
  collapsed: boolean;
  onClose?: () => void;
  onRename?: (newName: string) => void;
  onSessionError?: (message: string) => void;
  onTerminalOutput?: (output: string) => void;
  onTerminalIdle?: () => void;
  terminalRefs: React.MutableRefObject<
    Map<string, ConsolidatedTerminalHandle | null>
  >;
  width?: number | null;
}

const ClaudeTerminalPanel = memo<ClaudeTerminalPanelProps>(
  function ClaudeTerminalPanel({
    sessionData,
    collapsed,
    onClose,
    onRename,
    onSessionError,
    onTerminalOutput,
    onTerminalIdle,
    terminalRefs,
    width,
  }) {
    const { addToast } = useToast();
    const searchInputRef = useRef<HTMLInputElement>(null);
    const nameInputRef = useRef<HTMLInputElement>(null);
    const [searchVisible, setSearchVisible] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [isResetting, setIsResetting] = useState(false);
    const [sessionModel, setSessionModelState] = useState<string | null>(null);
    const [isChangingModel, setIsChangingModel] = useState(false);
    const [isModelLoaded, setIsModelLoaded] = useState(false);
    const [terminalInstanceKey, setTerminalInstanceKey] = useState(0);
    const [pendingModelReset, setPendingModelReset] = useState(false);
    const [isEditingName, setIsEditingName] = useState(false);
    const [editNameValue, setEditNameValue] = useState(sessionData.sessionName);

    const terminalId = `claude-${sessionData.sessionId}`;
    const isHidden = collapsed;

    // Load session model on mount
    useEffect(() => {
      const loadModel = async () => {
        try {
          const model = await getSessionModel(
            sessionData.repoPath,
            sessionData.sessionId
          );
          setSessionModelState(model);
        } catch (error) {
          console.error("Failed to load session model:", error);
        } finally {
          setIsModelLoaded(true);
        }
      };
      loadModel();
    }, [sessionData.repoPath, sessionData.sessionId]);

    // Search handlers
    const openSearchPanel = useCallback(() => {
      setSearchVisible(true);
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      });
    }, []);

    const closeSearchPanel = useCallback(() => {
      setSearchVisible(false);
      setSearchQuery("");
      terminalRefs.current.get(terminalId)?.clearSearch();
    }, [terminalRefs, terminalId]);

    // Inline name editing handlers
    const startEditingName = useCallback(() => {
      setEditNameValue(sessionData.sessionName);
      setIsEditingName(true);
      requestAnimationFrame(() => {
        nameInputRef.current?.focus();
        nameInputRef.current?.select();
      });
    }, [sessionData.sessionName]);

    const cancelEditingName = useCallback(() => {
      setIsEditingName(false);
      setEditNameValue(sessionData.sessionName);
    }, [sessionData.sessionName]);

    const saveEditedName = useCallback(() => {
      const trimmed = editNameValue.trim();
      if (trimmed && trimmed !== sessionData.sessionName) {
        onRename?.(trimmed);
      }
      setIsEditingName(false);
    }, [editNameValue, sessionData.sessionName, onRename]);

    const handleNameKeyDown = useCallback(
      (e: ReactKeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
          e.preventDefault();
          saveEditedName();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancelEditingName();
        }
      },
      [saveEditedName, cancelEditingName]
    );

    const runSearch = useCallback(
      (direction: "next" | "previous") => {
        if (!searchQuery.trim()) return;
        const terminal = terminalRefs.current.get(terminalId);
        if (!terminal) return;
        if (direction === "next") {
          terminal.findNext(searchQuery);
        } else {
          terminal.findPrevious(searchQuery);
        }
      },
      [searchQuery, terminalRefs, terminalId]
    );

    const handleSearchKeyDown = useCallback(
      (e: ReactKeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (e.shiftKey) {
            runSearch("previous");
          } else {
            runSearch("next");
          }
        } else if (e.key === "Escape") {
          closeSearchPanel();
        }
      },
      [runSearch, closeSearchPanel]
    );

    // Reset handler
    const handleReset = useCallback(async () => {
      setIsResetting(true);
      try {
        await ptyClose(sessionData.ptySessionId).catch(console.error);
        setTerminalInstanceKey((prev) => prev + 1);
        addToast({
          title: "Terminal Reset",
          description: "Starting new Claude session",
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
    }, [sessionData.ptySessionId, addToast]);

    // Model change handler
    const handleModelChange = useCallback(
      async (newModel: string) => {
        setIsChangingModel(true);
        try {
          const modelToSave = newModel === "default" ? null : newModel;
          await setSessionModel(
            sessionData.repoPath,
            sessionData.sessionId,
            modelToSave
          );
          setSessionModelState(modelToSave);
          setPendingModelReset(true);
        } catch (error) {
          addToast({
            title: "Failed to change model",
            description: error instanceof Error ? error.message : String(error),
            type: "error",
          });
          setIsChangingModel(false);
        }
      },
      [sessionData.repoPath, sessionData.sessionId, addToast]
    );

    // Reset terminal when model changes
    useEffect(() => {
      if (!pendingModelReset) return;
      const performReset = async () => {
        await handleReset();
        addToast({
          title: "Model Changed",
          description: `Switched to ${sessionModel || "default"}`,
          type: "success",
        });
        setIsChangingModel(false);
        setPendingModelReset(false);
      };
      performReset();
    }, [pendingModelReset, handleReset, sessionModel, addToast]);

    const autoCommand = sessionModel
      ? `claude --permission-mode plan --model="${sessionModel}"`
      : "claude --permission-mode plan";

    return (
      <div
        data-terminal-id={terminalId}
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
            <Bot className="w-3 h-3 flex-shrink-0" />
            {isEditingName ? (
              <input
                ref={nameInputRef}
                type="text"
                value={editNameValue}
                onChange={(e) => setEditNameValue(e.target.value)}
                onKeyDown={handleNameKeyDown}
                onBlur={saveEditedName}
                className="bg-muted border border-border rounded px-1 py-0 text-xs font-medium text-foreground w-full max-w-[150px] outline-none focus:ring-1 focus:ring-primary"
              />
            ) : (
              <span
                className="truncate cursor-pointer hover:text-foreground transition-colors"
                onDoubleClick={startEditingName}
                title="Double-click to rename"
              >
                {sessionData.sessionName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-0.5">
            {/* Model selector */}
            <ModelSelector
              currentModel={sessionModel}
              onModelChange={handleModelChange}
              disabled={isChangingModel || isResetting}
            />
            {/* Reset button */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleReset}
                    disabled={isResetting}
                    className="h-5 w-5 rounded-sm hover:bg-muted flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity disabled:opacity-30"
                    aria-label="Reset terminal"
                  >
                    {isResetting ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <RotateCw className="w-3 h-3" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>Reset</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {/* Search button */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={openSearchPanel}
                    className="h-5 w-5 rounded-sm hover:bg-muted flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity"
                    aria-label="Search"
                  >
                    <Search className="w-3 h-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Search (⌘+F)</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {/* Close button */}
            {onClose && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={onClose}
                      className="h-5 w-5 rounded-sm hover:bg-muted flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity"
                      aria-label="Close session"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Close</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>

        {/* Terminal with search overlay */}
        <div className="flex-1 min-h-0 overflow-hidden relative border-r border-border" style={{ backgroundColor: "#1e1e1e" }}>
          {/* Search overlay */}
          {searchVisible && !collapsed && (
            <div className="absolute top-2 right-2 z-20 bg-background border border-border rounded-md shadow-lg p-0.5 flex items-center gap-0.5">
              <Input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Find"
                onKeyDown={handleSearchKeyDown}
                className="h-6 w-48 text-sm !outline-none !ring-0"
              />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="h-5 w-5 rounded-sm bg-background text-muted-foreground flex items-center justify-center transition-colors hover:text-foreground hover:bg-muted disabled:opacity-50 disabled:pointer-events-none"
                      onClick={() => runSearch("previous")}
                      disabled={!searchQuery.trim()}
                      aria-label="Find previous"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Previous (Shift+Enter)</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="h-5 w-5 rounded-sm bg-background text-muted-foreground flex items-center justify-center transition-colors hover:text-foreground hover:bg-muted disabled:opacity-50 disabled:pointer-events-none"
                      onClick={() => runSearch("next")}
                      disabled={!searchQuery.trim()}
                      aria-label="Find next"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Next (Enter)</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="h-5 w-5 rounded-sm bg-background text-muted-foreground flex items-center justify-center transition-colors hover:text-foreground hover:bg-muted"
                      onClick={closeSearchPanel}
                      aria-label="Close search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Close (Esc)</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}

          {/* Terminal */}
          {isModelLoaded ? (
            <ConsolidatedTerminal
              key={`${sessionData.ptySessionId}-${terminalInstanceKey}`}
              ref={(el) => {
                if (el) {
                  terminalRefs.current.set(terminalId, el);
                } else {
                  terminalRefs.current.delete(terminalId);
                }
              }}
              sessionId={sessionData.ptySessionId}
              workingDirectory={sessionData.workspacePath || sessionData.repoPath}
              autoCommand={autoCommand}
              onSessionError={onSessionError}
              onTerminalOutput={onTerminalOutput}
              onTerminalIdle={onTerminalIdle}
              containerClassName="h-full w-full overflow-hidden"
              terminalPaneClassName="w-full h-full"
              isHidden={isHidden}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              Loading...
            </div>
          )}
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
