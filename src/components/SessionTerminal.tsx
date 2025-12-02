import { type KeyboardEvent as ReactKeyboardEvent, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Worktree,
  Session,
  PlanMetadata,
  BranchInfo,
  BranchDivergence,
  savePlanToFile,
  savePlanToRepo,
  loadPlanFromRepo,
  clearSessionPlans,
  ptyWrite,
  ptyClose,
  updateSessionName,
  gitPush,
  gitPushForce,
  gitMerge,
  getSetting,
  gitGetBranchInfo,
  gitGetBranchDivergence,
  preloadWorktreeGitData,
  gitGetCurrentBranch,
  getSessionModel,
  setSessionModel,
} from "../lib/api";
import { PlanSection } from "../types/planning";
import { createDebouncedParser } from "../lib/planParser";
import { ConsolidatedTerminal, type ConsolidatedTerminalHandle } from "./ConsolidatedTerminal";
import { StagingDiffViewer, type StagingDiffViewerHandle } from "./StagingDiffViewer";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useToast } from "./ui/toast";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { PlanHistoryDialog } from "./PlanHistoryDialog";
import { Loader2, RotateCw, X, GitBranch, Search, ChevronDown, ChevronUp, Pencil, Check, MoreVertical, GitMerge, Upload, AlertTriangle, FileText, ArrowDownToLine, PanelLeftClose } from "lucide-react";
import { PlanDisplayModal } from "./PlanDisplayModal";
import { ModelSelector } from "./ModelSelector";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { cn } from "../lib/utils";
import { useKeyboardShortcut } from "../hooks/useKeyboard";

type SessionPanel = "planning" | "execution" | null;

interface SessionTerminalProps {
  repositoryPath?: string;
  worktree?: Worktree;
  session?: Session | null;
  sessionId: number | null;
  onClose: () => void;
  onExecutePlan?: (section: PlanSection) => void;
  onExecutePlanInWorktree?: (section: PlanSection, sourceBranch: string, currentSessionName?: string) => Promise<void>;
  initialPlanContent?: string;
  initialPlanTitle?: string;
  initialPrompt?: string;
  initialPromptLabel?: string;
  initialSelectedFile?: string;
  onSessionActivity?: (sessionId: number) => void;
  isHidden?: boolean;
}

export const SessionTerminal = memo<SessionTerminalProps>(function SessionTerminal({
  repositoryPath,
  worktree,
  session,
  sessionId,
  onClose,
  onExecutePlan,
  onExecutePlanInWorktree,
  initialPlanContent,
  initialPlanTitle,
  initialPrompt,
  initialPromptLabel,
  initialSelectedFile,
  onSessionActivity,
  isHidden = false,
}) {
  const workingDirectory = worktree?.worktree_path || repositoryPath || "";
  const effectiveRepoPath = worktree?.repo_path || repositoryPath || "";
  const ptySessionId = sessionId ? `session-${sessionId}` : `session-${crypto.randomUUID()}`;
  const queryClient = useQueryClient();

  const { addToast } = useToast();
  const [planSections, setPlanSections] = useState<PlanSection[]>([]);
  const [terminalOutput, setTerminalOutput] = useState("");
  const [activePanel, setActivePanel] = useState<SessionPanel>(null);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [autoCommandReady, setAutoCommandReady] = useState(false);
  const debouncedParserRef = useRef(createDebouncedParser(1000));

  const [refreshSignal, setRefreshSignal] = useState(0);
  const [lastPromptLabel, setLastPromptLabel] = useState<string | null>(null);
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const [terminalInstanceKey, setTerminalInstanceKey] = useState(0);

  const queuedMessagesRef = useRef<string[]>([]);
  const consolidatedTerminalRef = useRef<ConsolidatedTerminalHandle | null>(null);
  const stagingDiffViewerRef = useRef<StagingDiffViewerHandle>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const sessionNameInputRef = useRef<HTMLInputElement>(null);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [terminalMinimized, setTerminalMinimized] = useState(false);
  const [isEditingSessionName, setIsEditingSessionName] = useState(false);
  const [editedSessionName, setEditedSessionName] = useState("");
  const [sessionDisplayName, setSessionDisplayName] = useState<string | null>(session?.name ?? null);
  const [isRenamingSession, setIsRenamingSession] = useState(false);
  const [actionPending, setActionPending] = useState<'push' | 'merge' | 'forcePush' | null>(null);
  const [showForcePushDialog, setShowForcePushDialog] = useState(false);
  const [isExecutingInWorktree, setIsExecutingInWorktree] = useState(false);
  const [mainTreePath, setMainTreePath] = useState<string | null>(null);
  const [remoteBranchInfo, setRemoteBranchInfo] = useState<BranchInfo | null>(null);
  const [maintreeBranchName, setMaintreeBranchName] = useState<string | null>(null);
  const [maintreeDivergence, setMaintreeDivergence] = useState<BranchDivergence | null>(null);
  const [showSwitchOverlay, setShowSwitchOverlay] = useState(false);
  const prevIsHiddenRef = useRef(isHidden);
  const [sessionModel, setSessionModelState] = useState<string | null>(null);
  const [isChangingModel, setIsChangingModel] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const hasImplementationPlan = planSections.some(
    section => section.type === 'implementation_plan'
  );

  const handleTerminalOutput = useCallback((output: string) => {
    setTerminalOutput(output);
    if (sessionId && onSessionActivity) {
      onSessionActivity(sessionId);
    }
  }, [sessionId, onSessionActivity]);

  useEffect(() => {
    setTerminalOutput("");
    setPlanSections([]);
    setActivePanel(null);
    setAutoCommandReady(false);
    queuedMessagesRef.current = [];
    setSearchVisible(false);
    setSearchQuery("");
    setTerminalError(null);
    consolidatedTerminalRef.current?.clearSearch();
  }, [ptySessionId, terminalInstanceKey]);

  useEffect(() => {
    setTerminalInstanceKey(0);
    setTerminalError(null);
  }, [ptySessionId]);

  useEffect(() => {
    // Skip git preload when hidden to avoid unnecessary work
    if (isHidden) {
      return;
    }

    const normalized = workingDirectory.trim();
    if (!normalized) {
      return;
    }

    preloadWorktreeGitData(normalized).catch((error) => {
      console.debug("git cache preload failed", normalized, error);
    });
  }, [workingDirectory, isHidden]);

  useEffect(() => {
    if (isEditingSessionName) {
      return;
    }
    setSessionDisplayName(session?.name ?? null);
  }, [session?.id, session?.name, isEditingSessionName]);

  useEffect(() => {
    if (isEditingSessionName) {
      requestAnimationFrame(() => {
        sessionNameInputRef.current?.focus();
        sessionNameInputRef.current?.select();
      });
    }
  }, [isEditingSessionName]);

  const detectPanelFromOutput = useCallback((output: string) => {
    if (!output) {
      return null;
    }
    const lines = output.split(/\r?\n/);
    const tail = lines.slice(-5).join("\n").toLowerCase();
    if (tail.includes("plan mode on")) {
      return "planning" as const;
    }
    if (tail.includes("edits on")) {
      return "execution" as const;
    }
    return null;
  }, []);

  useEffect(() => {
    setActivePanel(detectPanelFromOutput(terminalOutput));
  }, [terminalOutput, detectPanelFromOutput]);

  // Reset right panel when session becomes hidden to unmount PlanDisplay/StagingDiffViewer
  useEffect(() => {
    if (isHidden) {
      setActivePanel(null);
    }
  }, [isHidden]);

  // Show loading overlay when switching from hidden to visible (canvas redraw)
  useEffect(() => {
    const wasHidden = prevIsHiddenRef.current;
    prevIsHiddenRef.current = isHidden;

    // Transition from hidden to visible - show overlay for 300ms
    if (wasHidden && !isHidden) {
      setShowSwitchOverlay(true);
      const timer = setTimeout(() => {
        setShowSwitchOverlay(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isHidden]);

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
    consolidatedTerminalRef.current?.clearSearch();
    consolidatedTerminalRef.current?.focus();
  }, []);

  const runSearch = useCallback(
    (direction: "next" | "previous") => {
      const term = searchQuery.trim();
      if (!term) {
        return;
      }
      if (direction === "next") {
        consolidatedTerminalRef.current?.findNext(term);
      } else {
        consolidatedTerminalRef.current?.findPrevious(term);
      }
    },
    [searchQuery]
  );

  const handleReviewSubmitted = useCallback(() => {
    if (terminalMinimized) {
      setTerminalMinimized(false);
      // Focus terminal after maximizing
      requestAnimationFrame(() => {
        consolidatedTerminalRef.current?.focus();
      });
    }
  }, [terminalMinimized]);

  useEffect(() => {
    if (!searchVisible) {
      return;
    }
    const term = searchQuery.trim();
    if (!term) {
      consolidatedTerminalRef.current?.clearSearch();
      return;
    }
    consolidatedTerminalRef.current?.findNext(term);
  }, [searchVisible, searchQuery]);

  const handleSearchKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        runSearch(event.shiftKey ? "previous" : "next");
      } else if (event.key === "Escape") {
        event.preventDefault();
        closeSearchPanel();
      }
    },
    [runSearch, closeSearchPanel]
  );

  const handleStartEditingSessionName = useCallback(() => {
    if (!session) {
      return;
    }
    setEditedSessionName(sessionDisplayName ?? session.name ?? "");
    setIsEditingSessionName(true);
  }, [session, sessionDisplayName]);

  const handleCancelSessionRename = useCallback(() => {
    setIsEditingSessionName(false);
    setEditedSessionName("");
  }, []);

  const handleSaveSessionName = useCallback(async () => {
    if (!session) {
      return;
    }
    const trimmed = editedSessionName.trim();
    if (!trimmed) {
      addToast({
        title: "Name required",
        description: "Enter a session name before saving.",
        type: "error",
      });
      return;
    }
    if (trimmed === (sessionDisplayName ?? session.name)) {
      handleCancelSessionRename();
      return;
    }

    try {
      setIsRenamingSession(true);
      const repoPath = worktree?.repo_path || repositoryPath || "";
      await updateSessionName(repoPath, session.id, trimmed);
      setSessionDisplayName(trimmed);
      setIsEditingSessionName(false);
      setEditedSessionName("");
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
    } catch (error) {
      addToast({
        title: "Rename failed",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
    } finally {
      setIsRenamingSession(false);
    }
  }, [
    session,
    editedSessionName,
    sessionDisplayName,
    addToast,
    handleCancelSessionRename,
    queryClient,
  ]);

  const handleSessionNameKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleSaveSessionName();
      } else if (event.key === "Escape") {
        event.preventDefault();
        handleCancelSessionRename();
      }
    },
    [handleSaveSessionName, handleCancelSessionRename]
  );

  useEffect(() => {
    const isWithinTerminal = (element: HTMLElement | null): boolean => {
      if (!element) return false;
      return element.closest('.xterm') !== null;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const activeElement = document.activeElement as HTMLElement | null;

      // Don't intercept events when terminal is focused
      if (isWithinTerminal(target) || isWithinTerminal(activeElement)) {
        return;
      }

      const isModifierPressed = event.metaKey || event.ctrlKey;
      if (isModifierPressed && event.key.toLowerCase() === "f") {
        const isTextInput =
          target?.tagName === "INPUT" ||
          target?.tagName === "TEXTAREA" ||
          target?.getAttribute("contenteditable") === "true";
        if (!isTextInput) {
          event.preventDefault();
          openSearchPanel();
        }
        return;
      }
      if (event.key === "Escape" && searchVisible) {
        event.stopPropagation();
        closeSearchPanel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openSearchPanel, closeSearchPanel, searchVisible]);

  // Cmd+E: Edit session name
  useKeyboardShortcut("e", true, () => {
    handleStartEditingSessionName();
  }, [session, sessionDisplayName]);

  // Cmd+/: Focus commit message
  useKeyboardShortcut("/", true, () => {
    stagingDiffViewerRef.current?.focusCommitInput();
  }, []);

  // Cmd+J: Toggle terminal minimize
  useKeyboardShortcut("j", true, () => {
    setTerminalMinimized(prev => !prev);
  }, []);

  const handlePlanEdit = useCallback(async (planId: string, newContent: string) => {
    if (!effectiveRepoPath) return;
    try {
      const updatedSection = planSections.find((section) => section.id === planId);
      setPlanSections((prev) =>
        prev.map((section) =>
          section.id === planId
            ? {
                ...section,
                editedContent: newContent,
                isEdited: true,
                editedAt: new Date(),
              }
            : section
        )
      );

      const metadata: PlanMetadata = {
        id: planId,
        title: updatedSection?.title || "Untitled Plan",
        plan_type: updatedSection?.type || "implementation_plan",
        worktree_id: worktree?.id,
        worktree_path: worktree?.worktree_path,
        branch_name: worktree?.branch_name,
        timestamp: new Date().toISOString(),
      };

      await savePlanToFile(effectiveRepoPath, planId, newContent, metadata);
      await savePlanToRepo(effectiveRepoPath, planId, newContent, ptySessionId);
    } catch (error) {
      console.error("Failed to save plan:", error);
      addToast({
        title: "Save Failed",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
    }
  }, [effectiveRepoPath, worktree, planSections, ptySessionId, addToast]);

  const handleExecuteSection = useCallback((section: PlanSection) => {
    onExecutePlan?.(section);
  }, [onExecutePlan]);

  const handleExecuteInWorktree = useCallback(async (section: PlanSection) => {
    if (!onExecutePlanInWorktree) return;

    // Close modal immediately when user clicks execute
    setPlanModalOpen(false);

    setIsExecutingInWorktree(true);
    try {
      // Determine source branch
      let sourceBranch: string;
      if (worktree) {
        sourceBranch = worktree.branch_name;
      } else if (effectiveRepoPath) {
        sourceBranch = await gitGetCurrentBranch(effectiveRepoPath);
      } else {
        throw new Error("No repository context available");
      }

      // This will create worktree and navigate to it
      await onExecutePlanInWorktree(section, sourceBranch, session?.name);
    } catch (error) {
      addToast({
        title: "Failed to execute in worktree",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
    } finally {
      setIsExecutingInWorktree(false);
    }
  }, [worktree, effectiveRepoPath, onExecutePlanInWorktree, addToast]);

  useEffect(() => {
    if (!terminalOutput) {
      setPlanSections([]);
      return;
    }

    debouncedParserRef.current(terminalOutput, async (sections) => {
      if (!effectiveRepoPath) {
        setPlanSections(sections);
        return;
      }

      const sectionsWithEdits = await Promise.all(
        sections.map(async (section) => {
          try {
            const savedPlan = await loadPlanFromRepo(effectiveRepoPath, section.id, ptySessionId);
            if (savedPlan) {
              const hasExplicitEdit = savedPlan.editedAt && new Date(savedPlan.editedAt) > section.timestamp;
              if (hasExplicitEdit) {
                return {
                  ...section,
                  editedContent: savedPlan.content,
                  isEdited: true,
                  editedAt: new Date(savedPlan.editedAt),
                };
              }
            }
          } catch (error) {
            console.error(`Failed to load plan ${section.id}:`, error);
          }
          return section;
        })
      );
      setPlanSections(sectionsWithEdits);
    });
  }, [terminalOutput, effectiveRepoPath, ptySessionId]);

  const handleReset = useCallback(async () => {
    setIsResetting(true);
    setTerminalError(null);
    try {
      // Close the existing PTY session to force a fresh Claude instance
      await ptyClose(ptySessionId).catch(console.error);

      if (effectiveRepoPath) {
        await clearSessionPlans(effectiveRepoPath, ptySessionId).catch(console.error);
      }

      setPlanSections([]);
      setTerminalOutput("");
      setActivePanel(null);
      setAutoCommandReady(false);
      queuedMessagesRef.current = [];

      // Increment instance key to remount ConsolidatedTerminal with a fresh PTY
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
  }, [effectiveRepoPath, ptySessionId, addToast]);

  const handleModelChange = useCallback(async (newModel: string) => {
    if (!sessionId || !effectiveRepoPath) return;

    setIsChangingModel(true);
    try {
      // Save the new model to the database
      await setSessionModel(effectiveRepoPath, sessionId, newModel);
      setSessionModelState(newModel);

      // Reset the terminal to apply the new model
      await handleReset();

      addToast({
        title: "Model Changed",
        description: `Switched to ${newModel}`,
        type: "success",
      });
    } catch (error) {
      addToast({
        title: "Failed to change model",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
    } finally {
      setIsChangingModel(false);
    }
  }, [sessionId, effectiveRepoPath, handleReset, addToast]);

  const handleRetryTerminal = useCallback(() => {
    setTerminalError(null);
    setTerminalInstanceKey((prev) => prev + 1);
  }, []);

  const handleSessionError = useCallback((message: string) => {
    const friendlyMessage = message.includes("Session not found")
      ? "Terminal session is still initializing. Please wait a moment and try again."
      : message;
    setTerminalError(friendlyMessage);
    addToast({
      title: "PTY Error",
      description: friendlyMessage,
      type: "error",
    });
  }, [addToast]);

  const handleAutoCommandError = useCallback((message: string) => {
    addToast({
      title: "Command Error",
      description: message,
      type: "error",
    });
  }, [addToast]);

  const handleStagedFilesChange = useCallback((_files: string[]) => {
    // No-op: staged files tracking not currently used
  }, []);

  const triggerSidebarRefresh = useCallback(() => {
    setRefreshSignal((prev) => prev + 1);
  }, []);

  const handleTerminalIdle = useCallback(() => {
    // Refresh git status when terminal goes idle (after command output stops)
    if (activePanel === "execution") {
      triggerSidebarRefresh();
    }
  }, [activePanel, triggerSidebarRefresh]);

  // Load main tree path from settings
  useEffect(() => {
    const loadMainTreePath = async () => {
      try {
        const repoPath = await getSetting("repo_path");
        setMainTreePath(repoPath || null);
      } catch {
        setMainTreePath(null);
      }
    };
    loadMainTreePath();
  }, []);

  useEffect(() => {
    // Skip expensive git operations when hidden
    if (isHidden) {
      return;
    }

    let isCancelled = false;

    const loadBranchComparisons = async () => {
      if (!worktree?.worktree_path) {
        if (!isCancelled) {
          setRemoteBranchInfo(null);
          setMaintreeBranchName(null);
          setMaintreeDivergence(null);
        }
        return;
      }

      try {
        const info = await gitGetBranchInfo(worktree.worktree_path);
        if (!isCancelled) {
          setRemoteBranchInfo(info);
        }
      } catch {
        if (!isCancelled) {
          setRemoteBranchInfo(null);
        }
      }

      if (!mainTreePath) {
        if (!isCancelled) {
          setMaintreeBranchName(null);
          setMaintreeDivergence(null);
        }
        return;
      }

      let baseBranchName = "";
      try {
        const baseInfo = await gitGetBranchInfo(mainTreePath);
        if (isCancelled) {
          return;
        }
        baseBranchName = baseInfo.name.trim();
        setMaintreeBranchName(baseInfo.name);
      } catch {
        if (!isCancelled) {
          setMaintreeBranchName(null);
          setMaintreeDivergence(null);
        }
        return;
      }

      if (!baseBranchName) {
        if (!isCancelled) {
          setMaintreeDivergence(null);
        }
        return;
      }

      try {
        const divergence = await gitGetBranchDivergence(worktree.worktree_path, baseBranchName);
        if (!isCancelled) {
          setMaintreeDivergence(divergence);
        }
      } catch {
        if (!isCancelled) {
          setMaintreeDivergence(null);
        }
      }
    };

    loadBranchComparisons();

    return () => {
      isCancelled = true;
    };
  }, [worktree?.worktree_path, mainTreePath, refreshSignal, isHidden]);

  const handleMergeIntoMaintree = useCallback(async () => {
    if (!mainTreePath || !worktree?.branch_name) {
      addToast({
        title: "Cannot merge",
        description: "Main tree path or current branch not available",
        type: "error",
      });
      return;
    }

    setActionPending('merge');
    try {
      await gitMerge(mainTreePath, worktree.branch_name, "regular");
      addToast({
        title: "Merged",
        description: `Branch ${worktree.branch_name} merged into main tree`,
        type: "success",
      });
      triggerSidebarRefresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addToast({
        title: "Merge failed",
        description: message,
        type: "error",
      });
    } finally {
      setActionPending(null);
    }
  }, [mainTreePath, worktree?.branch_name, addToast, triggerSidebarRefresh]);

  const handleUpdateFromMaintree = useCallback(async () => {
    if (!workingDirectory || !maintreeBranchName) {
      addToast({
        title: "Cannot update",
        description: "Working directory or maintree branch not available",
        type: "error",
      });
      return;
    }

    setActionPending('merge');
    try {
      await gitMerge(workingDirectory, maintreeBranchName, "regular");
      addToast({
        title: "Updated",
        description: `Branch updated with changes from ${maintreeBranchName}`,
        type: "success",
      });
      triggerSidebarRefresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addToast({
        title: "Update failed",
        description: message,
        type: "error",
      });
    } finally {
      setActionPending(null);
    }
  }, [workingDirectory, maintreeBranchName, addToast, triggerSidebarRefresh]);

  const handlePushToRemote = useCallback(async () => {
    if (!workingDirectory) return;

    setActionPending('push');
    try {
      await gitPush(workingDirectory);
      addToast({
        title: "Pushed",
        description: "Changes pushed to remote",
        type: "success",
      });
      triggerSidebarRefresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addToast({
        title: "Push failed",
        description: message,
        type: "error",
      });
    } finally {
      setActionPending(null);
    }
  }, [workingDirectory, addToast, triggerSidebarRefresh]);

  const handleForcePush = useCallback(async () => {
    if (!workingDirectory) return;

    setShowForcePushDialog(false);
    setActionPending('forcePush');
    try {
      await gitPushForce(workingDirectory);
      addToast({
        title: "Force pushed",
        description: "Changes force pushed to remote",
        type: "success",
      });
      triggerSidebarRefresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addToast({
        title: "Force push failed",
        description: message,
        type: "error",
      });
    } finally {
      setActionPending(null);
    }
  }, [workingDirectory, addToast, triggerSidebarRefresh]);

  const buildPlanPrompt = useCallback(() => {
    if (!initialPlanContent) return null;
    const title = initialPlanTitle?.trim() || "Implementation Plan";
    return `Please implement the following plan:\n\n# ${title}\n\n${initialPlanContent}\n`;
  }, [initialPlanContent, initialPlanTitle]);

  const flushQueuedMessages = useCallback(() => {
    if (!queuedMessagesRef.current.length) {
      return;
    }
    const next = queuedMessagesRef.current.shift();
    if (!next) {
      return;
    }

    ptyWrite(ptySessionId, next)
      .then(() => {
        if (queuedMessagesRef.current.length > 0) {
          setTimeout(() => {
            flushQueuedMessages();
          }, 400);
        } else {
          // All messages sent - focus terminal
          consolidatedTerminalRef.current?.focus();
        }
      })
      .catch((error) => {
        console.error("Failed to send automated prompt:", error);
        addToast({
          title: "Prompt Error",
          description: "Unable to deliver the automated instructions to Claude.",
          type: "error",
        });
      });
  }, [ptySessionId, addToast]);

  useEffect(() => {
    setAutoCommandReady(false);
  }, [ptySessionId]);

  const prevInitialPromptRef = useRef<string | undefined>(undefined);

  // Load session model on mount
  useEffect(() => {
    const loadSessionModel = async () => {
      if (!sessionId || !effectiveRepoPath) return;

      try {
        const model = await getSessionModel(effectiveRepoPath, sessionId);
        setSessionModelState(model);
      } catch (error) {
        console.error("Failed to load session model:", error);
      }
    };

    loadSessionModel();
  }, [sessionId, effectiveRepoPath]);

  useEffect(() => {
    const queue: string[] = [];
    const planPrompt = buildPlanPrompt();
    if (planPrompt) {
      queue.push(`${planPrompt}\n`);
    }
    if (initialPrompt && initialPrompt.trim()) {
      queue.push(`${initialPrompt}\n`);
      setLastPromptLabel(initialPromptLabel || null);
    } else {
      setLastPromptLabel(null);
    }
    queuedMessagesRef.current = queue;

    // If initialPrompt changed while session is already ready, flush immediately
    const promptChanged = prevInitialPromptRef.current !== initialPrompt;
    prevInitialPromptRef.current = initialPrompt;

    if (promptChanged && autoCommandReady && initialPrompt && initialPrompt.trim()) {
      setTimeout(() => {
        flushQueuedMessages();
      }, 500);
    }
  }, [ptySessionId, buildPlanPrompt, initialPrompt, initialPromptLabel, autoCommandReady, flushQueuedMessages]);

  useEffect(() => {
    if (!autoCommandReady) {
      return;
    }

    const timeout = setTimeout(() => {
      flushQueuedMessages();
    }, 1500);

    return () => clearTimeout(timeout);
  }, [autoCommandReady, flushQueuedMessages]);

  const executionPanel = workingDirectory ? (
    <div className="flex flex-col h-full">
        <StagingDiffViewer
          ref={stagingDiffViewerRef}
          worktreePath={workingDirectory}
          disableInteractions={false}
          onStagedFilesChange={handleStagedFilesChange}
          refreshSignal={refreshSignal}
          initialSelectedFile={initialSelectedFile}
          terminalSessionId={ptySessionId}
          onReviewSubmitted={handleReviewSubmitted}
        />
    </div>
  ) : (
    <div className="h-full flex items-center justify-center text-center p-6 text-sm text-muted-foreground">
      Configure a worktree or repository path to manage commits.
    </div>
  );

  const rightPanel = executionPanel;

  const terminalOverlay = useMemo(() => {
    if (terminalError) {
      return (
        <div className="absolute inset-0 bg-background/90 backdrop-blur-sm flex items-center justify-center z-20 p-6">
          <div className="w-full max-w-sm rounded-lg border bg-card p-4 text-center shadow-lg">
            <p className="text-sm font-semibold">Unable to start terminal</p>
            <p className="text-xs text-muted-foreground mt-2 break-words">{terminalError}</p>
            <div className="mt-4 flex flex-col gap-2">
              <Button size="sm" onClick={handleRetryTerminal}>
                Try again
              </Button>
              <Button size="sm" variant="outline" onClick={onClose}>
                Close session
              </Button>
            </div>
          </div>
        </div>
      );
    }

    if (isResetting) {
      return (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-20">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Resetting terminal...</p>
          </div>
        </div>
      );
    }

    if (showSwitchOverlay) {
      return (
        <div className="absolute inset-0 flex items-center justify-center bg-[#1e1e1e] z-20">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      );
    }

    return undefined;
  }, [handleRetryTerminal, isResetting, onClose, terminalError, showSwitchOverlay]);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDragEnter = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    // Only hide if leaving the terminal container itself
    if (event.currentTarget === event.target) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(async (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);

    try {
      const { files, items } = event.dataTransfer;

      // Check if there are files dropped
      if (files.length > 0) {
        const file = files[0];

        // Try to get the file path (works in Tauri/Electron environments)
        // @ts-ignore - path property is not standard but available in Tauri
        const filePath = file.path;

        if (filePath) {
          // Insert file path into terminal
          const escapedPath = filePath.includes(' ') ? `"${filePath}"` : filePath;
          await ptyWrite(ptySessionId, escapedPath);
          consolidatedTerminalRef.current?.focus();
          return;
        }
      }

      // Check if there's an image in the clipboard
      if (items.length > 0) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];

          // Check if it's an image
          if (item.type.startsWith('image/')) {
            // Trigger paste operation in the terminal
            // Read the clipboard and write it to the terminal
            try {
              const text = await navigator.clipboard.readText();
              if (text) {
                await ptyWrite(ptySessionId, text);
                consolidatedTerminalRef.current?.focus();
                return;
              }
            } catch (clipboardError) {
              console.warn('Clipboard read failed:', clipboardError);
            }

            // If clipboard text read fails, try to paste the image data
            const blob = await new Promise<Blob | null>((resolve) => {
              item.getAsString(() => resolve(null));
              const file = item.getAsFile();
              resolve(file);
            });

            if (blob) {
              addToast({
                title: "Image dropped",
                description: "Image files cannot be pasted directly. Please save and drag the file instead.",
                type: "info",
              });
            }
            return;
          }
        }
      }

      addToast({
        title: "Drop not supported",
        description: "Please drop a file or copy an image to clipboard first.",
        type: "info",
      });
    } catch (error) {
      addToast({
        title: "Drop failed",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
    }
  }, [ptySessionId, addToast]);

  const getWorktreeTitle = (): string => {
    if (worktree?.metadata) {
      try {
        const metadata = JSON.parse(worktree.metadata);
        return metadata.initial_plan_title || metadata.intent || worktree.branch_name;
      } catch {
        return worktree.branch_name;
      }
    }
    return worktree?.branch_name || "Main";
  };

  const sessionTitle =
    sessionDisplayName && sessionDisplayName.trim().length > 0
      ? sessionDisplayName.trim()
      : session?.name && session.name.trim().length > 0
        ? session.name.trim()
        : "Session Terminal";

  return (
    <div className="h-screen w-full flex flex-col bg-background">
      <div className="border-b p-2 flex flex-col gap-1">
        {/* Row 1: Session name */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 group">
            {isEditingSessionName ? (
              <div className="flex items-center gap-2">
                <Input
                  ref={sessionNameInputRef}
                  value={editedSessionName}
                  onChange={(event) => setEditedSessionName(event.target.value)}
                  onKeyDown={handleSessionNameKeyDown}
                  className="h-8 w-44 text-sm"
                  placeholder="Session name"
                  disabled={isRenamingSession}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSaveSessionName}
                  disabled={isRenamingSession}
                  aria-label="Save session name"
                >
                  {isRenamingSession ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCancelSessionRename}
                  disabled={isRenamingSession}
                  aria-label="Cancel rename"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">{sessionTitle}</h2>
                {session && (
                  <button
                    type="button"
                    onClick={handleStartEditingSessionName}
                    className="text-muted-foreground hover:text-foreground transition-opacity opacity-0 group-hover:opacity-100 focus-visible:opacity-100 h-6 w-6 flex items-center justify-center"
                    aria-label="Rename session"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="px-2"
                  disabled={!!actionPending}
                >
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={4}>
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    handleUpdateFromMaintree();
                  }}
                  disabled={!maintreeBranchName || !workingDirectory}
                >
                  <ArrowDownToLine className="w-4 h-4 mr-2" />
                  Update from maintree
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    handleMergeIntoMaintree();
                  }}
                  disabled={!mainTreePath || !worktree?.branch_name}
                >
                  <GitMerge className="w-4 h-4 mr-2" />
                  Merge into maintree
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    handlePushToRemote();
                  }}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Push to remote
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    setShowForcePushDialog(true);
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  <AlertTriangle className="w-4 h-4 mr-2" />
                  Push to remote (force)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Row 2: Worktree info */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1 items-start">
            {worktree && (
              <span className="text-xs text-muted-foreground font-mono">{getWorktreeTitle()}</span>
            )}
            {(initialPromptLabel || lastPromptLabel) && (
              <span className="text-[10px] inline-flex items-center gap-1 text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                {initialPromptLabel || lastPromptLabel}
              </span>
            )}
          </div>

          {worktree && (
            <div className="flex items-start gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 font-mono text-foreground">
                <GitBranch className="w-3 h-3" />
                <span className="font-semibold block max-w-[160px] truncate" title={worktree.branch_name}>
                  {worktree.branch_name}
                </span>
              </span>

              {maintreeBranchName && (
                <div className="flex flex-col items-center gap-1">
                  <span
                    className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-mono"
                    title={`Compared to ${maintreeBranchName}`}
                  >
                    <span>{maintreeDivergence?.ahead ?? 0}↑</span>
                    <span>{maintreeDivergence?.behind ?? 0}↓</span>
                  </span>
                  <span className="text-[10px] uppercase tracking-wide">maintree</span>
                </div>
              )}

              <div className="flex flex-col items-center gap-1">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-mono",
                    !remoteBranchInfo?.upstream && "opacity-50"
                  )}
                  title={remoteBranchInfo?.upstream ? `Tracking ${remoteBranchInfo.upstream}` : "No upstream configured"}
                >
                  <span>{remoteBranchInfo?.ahead ?? 0}↑</span>
                  <span>{remoteBranchInfo?.behind ?? 0}↓</span>
                </span>
                <span className="text-[10px] uppercase tracking-wide">remote</span>
              </div>
            </div>
          )}

          {terminalMinimized && (
            <button
              type="button"
              onClick={() => setTerminalMinimized(false)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-sm font-medium border border-primary/20"
              aria-label="Maximize terminal"
            >
              <ChevronUp className="w-3.5 h-3.5" />
              <span>Show Terminal</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden resize-container relative">
        <div
          className={cn(
            "flex flex-col overflow-hidden relative",
            terminalMinimized ? "w-0" : "w-1/3"
          )}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Drag overlay */}
          {isDragging && (
            <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary z-30 flex items-center justify-center pointer-events-none">
              <div className="bg-background/90 px-4 py-3 rounded-lg shadow-lg border border-primary">
                <p className="text-sm font-medium text-primary">Drop file here</p>
              </div>
            </div>
          )}

          {/* Floating refresh and search buttons */}
          {!searchVisible && (
            <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
              {sessionId && (
                <ModelSelector
                  currentModel={sessionModel}
                  onModelChange={handleModelChange}
                  disabled={isChangingModel || isResetting}
                />
              )}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={handleReset}
                      disabled={isResetting}
                      className="h-6 w-6 rounded-md bg-background/90 border border-border/60 hover:bg-muted flex items-center justify-center transition-colors shadow-sm disabled:opacity-50"
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
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setTerminalMinimized(true)}
                      className="h-6 w-6 rounded-md bg-background/90 border border-border/60 hover:bg-muted flex items-center justify-center transition-colors shadow-sm"
                      aria-label="Minimize terminal"
                    >
                      <PanelLeftClose className="w-3 h-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Minimize (Cmd+J)</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={openSearchPanel}
                      className="h-6 w-6 rounded-md bg-background/90 border border-border/60 hover:bg-muted flex items-center justify-center transition-colors shadow-sm"
                      aria-label="Search terminal output"
                    >
                      <Search className="w-3 h-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Search (Cmd+F)</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {activePanel === "planning" && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => setPlanModalOpen(true)}
                        disabled={!hasImplementationPlan}
                        className={cn(
                          "h-6 w-6 rounded-md bg-background/90 border border-border/60 flex items-center justify-center transition-colors shadow-sm",
                          hasImplementationPlan
                            ? "hover:bg-muted cursor-pointer"
                            : "opacity-50 cursor-not-allowed"
                        )}
                        aria-label="View implementation plan"
                      >
                        <FileText className="w-3 h-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {hasImplementationPlan ? "View Plan" : "No plan detected"}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          )}

          {/* Compact search overlay */}
          {searchVisible && (
            <div className="absolute top-2 right-2 z-20 bg-background border border-border rounded-md shadow-lg p-2 flex items-center gap-2">
              <Input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Find"
                onKeyDown={handleSearchKeyDown}
                className="h-7 w-48 text-sm"
              />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="h-7 w-7 rounded-sm border border-border/60 bg-background text-muted-foreground flex items-center justify-center transition-colors hover:text-foreground hover:bg-muted disabled:opacity-50 disabled:pointer-events-none"
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
                      className="h-7 w-7 rounded-sm border border-border/60 bg-background text-muted-foreground flex items-center justify-center transition-colors hover:text-foreground hover:bg-muted disabled:opacity-50 disabled:pointer-events-none"
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
                      className="h-7 w-7 rounded-sm border border-border/60 bg-background text-muted-foreground flex items-center justify-center transition-colors hover:text-foreground hover:bg-muted"
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

          {!terminalMinimized && (
            <ConsolidatedTerminal
              key={`${ptySessionId}-${terminalInstanceKey}`}
              ref={consolidatedTerminalRef}
              sessionId={ptySessionId}
              workingDirectory={workingDirectory}
              autoCommand={sessionModel ? `claude --permission-mode plan --model ${sessionModel}` : "claude --permission-mode plan"}
              autoCommandDelay={300}
              onAutoCommandComplete={() => setAutoCommandReady(true)}
              onAutoCommandError={handleAutoCommandError}
              onSessionError={handleSessionError}
              onTerminalOutput={handleTerminalOutput}
              onTerminalIdle={handleTerminalIdle}
              rightPanel={null}
              showDiffViewer={true}
              containerClassName="flex-1 flex overflow-hidden"
              terminalPaneClassName="w-full"
              rightPaneClassName="hidden"
              terminalOverlay={terminalOverlay}
              isHidden={isHidden}
            />
          )}
        </div>

        <div className="w-1 bg-border flex-shrink-0" />

        <div className="w-2/3 flex flex-col overflow-hidden">
          {rightPanel}
        </div>
      </div>

      <PlanHistoryDialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen} worktree={worktree || null} />

      <PlanDisplayModal
        open={planModalOpen}
        onOpenChange={setPlanModalOpen}
        planSections={planSections}
        onPlanEdit={handlePlanEdit}
        onExecutePlan={handleExecuteSection}
        onExecuteInWorktree={handleExecuteInWorktree}
        isExecutingInWorktree={isExecutingInWorktree}
        sessionId={ptySessionId}
        repoPath={effectiveRepoPath}
        worktreeId={worktree?.id}
      />

      {/* Force Push Confirmation Dialog */}
      <Dialog open={showForcePushDialog} onOpenChange={setShowForcePushDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Force Push Warning
            </DialogTitle>
            <DialogDescription className="pt-2">
              Force pushing will overwrite the remote branch history. This action cannot be undone and may cause issues for other collaborators who have pulled from this branch.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setShowForcePushDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleForcePush}
              disabled={!!actionPending}
            >
              {actionPending === 'forcePush' ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Force Push
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
});
