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
} from "../ConsolidatedTerminal";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import { ptyClose, setSessionModel, getSessionModel } from "../../lib/api";
import {
  ChevronDown,
  ChevronUp,
  X,
  Search,
  RotateCw,
  Loader2,
  Bot,
} from "lucide-react";
import { ModelSelector } from "../ModelSelector";
import { Input } from "../ui/input";
import { useToast } from "../ui/toast";
import { MIN_TERMINAL_WIDTH, type ClaudeSessionData } from "./types";

// Claude terminal panel with header
export interface ClaudeTerminalPanelProps {
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

export const ClaudeTerminalPanel = memo<ClaudeTerminalPanelProps>(
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

    // Handle terminal output
    const handleTerminalOutput = useCallback(
      (output: string) => {
        // Forward to parent callback
        onTerminalOutput?.(output);
      },
      [onTerminalOutput]
    );

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

    // Reset handler - silent option used when reset is triggered by model change
    const handleReset = useCallback(async (options?: { silent?: boolean }) => {
      setIsResetting(true);
      try {
        await ptyClose(sessionData.ptySessionId).catch(console.error);
        setTerminalInstanceKey((prev) => prev + 1);
        if (!options?.silent) {
          addToast({
            title: "Terminal Reset",
            description: "Starting new Claude session",
            type: "info",
          });
        }
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
        await handleReset({ silent: true });
        addToast({
          title: "Terminal Restarting",
          description: `Using model: ${sessionModel || "default"}`,
          type: "info",
        });
        setIsChangingModel(false);
        setPendingModelReset(false);
      };
      performReset();
    }, [pendingModelReset, handleReset, sessionModel, addToast]);

    // Build Claude command with optional pending prompt
    const permissionModeArg = sessionData.permissionMode === 'plan'
      ? ' --permission-mode plan'
      : ' --permission-mode acceptEdits';

    let autoCommand = sessionModel
      ? `claude${permissionModeArg} --model="${sessionModel}"`
      : `claude${permissionModeArg}`;

    // If there's a pending prompt, append it as a command argument
    if (sessionData.pendingPrompt) {
      // Escape newlines and quotes for shell
      const escapedPrompt = sessionData.pendingPrompt
        .replace(/\\/g, '\\\\')  // Escape backslashes first
        .replace(/"/g, '\\"')    // Escape double quotes
        .replace(/\n/g, '\\n');  // Escape newlines as \n
      autoCommand += ` "${escapedPrompt}"`;
    }

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
          <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground min-w-0">
            <Bot className="w-3 h-3 flex-shrink-0" />
            {isEditingName ? (
              <input
                ref={nameInputRef}
                type="text"
                value={editNameValue}
                onChange={(e) => setEditNameValue(e.target.value)}
                onKeyDown={handleNameKeyDown}
                onBlur={saveEditedName}
                className="bg-muted border border-border rounded px-1 py-0 text-sm font-medium text-foreground w-full max-w-[150px] outline-none focus:ring-1 focus:ring-primary"
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
                  <Button
                    type="button"
                    onClick={() => handleReset()}
                    disabled={isResetting}
                    variant="ghost"
                    className="h-5 w-5 rounded-sm p-0 opacity-60 hover:opacity-100 disabled:opacity-30"
                    aria-label="Reset terminal"
                  >
                    {isResetting ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <RotateCw className="w-3 h-3" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Reset</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {/* Search button */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    onClick={openSearchPanel}
                    variant="ghost"
                    className="h-5 w-5 rounded-sm p-0 opacity-60 hover:opacity-100"
                    aria-label="Search"
                  >
                    <Search className="w-3 h-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Search (⌘+F)</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {/* Close button */}
            {onClose && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      onClick={onClose}
                      variant="ghost"
                      className="h-5 w-5 rounded-sm p-0 opacity-60 hover:opacity-100"
                      aria-label="Close session"
                    >
                      <X className="w-3 h-3" />
                    </Button>
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
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-5 w-5 rounded-sm p-0 bg-background text-muted-foreground hover:text-foreground"
                      onClick={() => runSearch("previous")}
                      disabled={!searchQuery.trim()}
                      aria-label="Find previous"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Previous (Shift+Enter)</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-5 w-5 rounded-sm p-0 bg-background text-muted-foreground hover:text-foreground"
                      onClick={() => runSearch("next")}
                      disabled={!searchQuery.trim()}
                      aria-label="Find next"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Next (Enter)</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-5 w-5 rounded-sm p-0 bg-background text-muted-foreground hover:text-foreground"
                      onClick={closeSearchPanel}
                      aria-label="Close search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
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
              onTerminalOutput={handleTerminalOutput}
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
