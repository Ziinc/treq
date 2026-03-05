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
import { type ClaudeSessionData } from "./types";

// Claude terminal panel with header
export interface ClaudeTerminalPanelProps {
  sessionData: ClaudeSessionData;
  collapsed: boolean;
  isActive?: boolean;
  onFocus?: () => void;
  onClose?: () => void;
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
    isActive,
    onFocus,
    onClose,
    onSessionError,
    onTerminalOutput,
    onTerminalIdle,
    terminalRefs,
    width,
  }) {
    const { addToast } = useToast();
    const searchInputRef = useRef<HTMLInputElement>(null);
    const [searchVisible, setSearchVisible] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [isResetting, setIsResetting] = useState(false);
    const [sessionModel, setSessionModelState] = useState<string | null>(null);
    const [isChangingModel, setIsChangingModel] = useState(false);
    const [isModelLoaded, setIsModelLoaded] = useState(false);
    const [terminalInstanceKey, setTerminalInstanceKey] = useState(0);
    const [pendingModelReset, setPendingModelReset] = useState(false);

    const terminalId = `claude-${sessionData.sessionId}`;
    const isHidden = collapsed;

    // Capture pendingPrompt and permissionMode in refs so they survive
    // the race condition where sessions refetch clears pendingClaudeSession
    // before isModelLoaded becomes true and ConsolidatedTerminal mounts.
    const pendingPromptRef = useRef(sessionData.pendingPrompt);
    const permissionModeRef = useRef(sessionData.permissionMode);

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
    // Use refs to avoid losing values due to race condition with sessions refetch
    const permissionModeArg = permissionModeRef.current === 'plan'
      ? ' --permission-mode plan'
      : ' --permission-mode acceptEdits';

    let autoCommand = 'claude';

    // Add permission mode and model flags first
    autoCommand += permissionModeArg;
    if (sessionModel) {
      autoCommand += ` --model="${sessionModel}"`;
    }

    // Add treq CLI documentation as system prompt for the Claude agent
    const agentWorkingDir = sessionData.workspacePath || sessionData.repoPath;
    const treqSystemPrompt = [
      "You have access to the treq CLI for managing workspaces. Available commands:",
      "- treq workspace ls — List all workspaces with their status",
      "- treq workspace st — Show status of all workspaces",
      "- treq workspace st <name> — Show detailed status for a specific workspace",
      "- treq workspace add <branch> [-i intent] [-s source_branch] — Create a new workspace",
      "- treq workspace set <name> [-i intent] [-t target_branch] — Update workspace settings",
      "- treq help — Show all available commands",
      "",
      `IMPORTANT: Your working directory is ${agentWorkingDir}. You MUST only create, edit, and delete files within this directory. Do not modify files outside of it.`,
      sessionData.workspacePath
        ? `This is a workspace directory. Do NOT make changes to files in the main repository or other workspaces.`
        : `This is the main repository. Do NOT make changes to files inside .treq/workspaces/.`,
    ].join("\\n");

    autoCommand += ` --append-system-prompt "${treqSystemPrompt}"`;

    // If there's a pending prompt, add it as a positional argument after --
    if (pendingPromptRef.current) {
      // Escape shell special characters (keep newlines as actual newlines)
      const escapedPrompt = pendingPromptRef.current
        .replace(/\\/g, '\\\\')  // Escape backslashes first
        .replace(/"/g, '\\"')    // Escape double quotes
        .replace(/`/g, '\\`')    // Escape backticks (command substitution)
        .replace(/\$/g, '\\$');  // Escape dollar signs (variable expansion)
      autoCommand += ` -- "${escapedPrompt}"`;
    }

    return (
      <div
        data-terminal-id={terminalId}
        className={cn(
          "flex flex-col min-h-0 overflow-hidden flex-shrink-0",
          width == null && "flex-1"
        )}
        style={{
          width: width != null ? width : undefined,
        }}
        onMouseDown={onFocus}
      >
        {/* Header */}
        <div className={cn(
          "h-7 min-h-[28px] flex items-center justify-between px-2 border-b border-r border-border flex-shrink-0",
          isActive ? "bg-primary/40" : "bg-gray-700"
        )}>
          <div className="flex items-center gap-1 text-sm font-medium text-gray-200">
            <Bot className="w-4 h-4" />
            <span className="truncate">
              {sessionData.sessionName}
            </span>
          </div>
          <div className="flex items-center gap-1">
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
                    onClick={() => handleReset()}
                    disabled={isResetting}
                    variant="ghost"
                    size="xs"
                className="bg-transparent text-gray-200 hover:bg-muted/20 hover:text-gray-200"
                    aria-label="Reset terminal"
                  >
                    {isResetting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RotateCw className="w-4 h-4" />
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
                className="bg-transparent text-gray-200 hover:bg-muted/20 hover:text-gray-200"
                      size="xs"
                    aria-label="Search"
                  >
                    <Search className="w-4 h-4" />
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
                      size="xs"
                className="bg-transparent text-gray-200 hover:bg-muted/20 hover:text-gray-200"
                      aria-label="Close session"
                    >
                      <X className="w-4 h-4" />
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
                      <ChevronUp className="w-4 h-4" />
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
                      <ChevronDown className="w-4 h-4" />
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
                      <X className="w-4 h-4" />
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
              onClose={onClose}
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
