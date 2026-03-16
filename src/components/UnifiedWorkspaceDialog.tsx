import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Check, AlertCircle, Cloud, Loader2, ChevronRight, ChevronDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { useToast } from "./ui/toast";
import { applyBranchNamePattern, getFullWorkspacePath } from "../lib/utils";
import {
  createWorkspace,
  getRepoSetting,
  checkBranchExists,
  jjGitFetchBackground,
  splitWorkspace,
  getWorkspaceStatus,
  jjGetChangedFiles,
  jjGetFileHunks,
  getWorkspaces,
  setWorkspaceTargetBranch,
  jjGetBranches,
  moveCommitToExistingWorkspace,
  type BranchStatus,
  type Workspace,
  type WorkspaceStatus,
  type JjFileChange,
  type JjDiffHunk,
} from "../lib/api";
import { TargetBranchSelector } from "./TargetBranchSelector";
import type { BranchListItem } from "./TargetBranchSelector";
import {
  getValidTargets,
  buildTreePreview,
  buildStackTreePreview,
  type TreeLine,
} from "../lib/workspace-tree";
import { cn } from "../lib/utils";
import { useCreateStackedWorkspace } from "../hooks/useCreateStackedWorkspace";

export interface WorkspaceDialogDefaults {
  /** Branch the new workspace should stack on */
  targetBranch?: string;
  /** Source workspace; null = home repo context; undefined = plain create */
  sourceWorkspace?: Workspace | null;
  /** Pre-selected commit change_ids for the Commits tab */
  preSelectedCommits?: string[];
  /** Pre-selected file paths for the Changes tab */
  preSelectedFiles?: string[];
  /** Pre-filled intent text */
  intent?: string;
  /** Pre-filled branch name */
  branchName?: string;
  /** Which right-panel tab to show by default */
  activeTab?: "commits" | "changes";
}

export interface UnifiedWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoPath: string;
  onSuccess: (workspaceId: number) => void;
  defaults: WorkspaceDialogDefaults;
}

export const UnifiedWorkspaceDialog: React.FC<UnifiedWorkspaceDialogProps> = ({
  open,
  onOpenChange,
  repoPath,
  onSuccess,
  defaults,
}) => {
  // ── form state ──────────────────────────────────────────────────────────────
  const [intent, setIntent] = useState("");
  const [branchName, setBranchName] = useState("");
  const [branchPattern, setBranchPattern] = useState("treq/{name}");
  const [isEditingBranch, setIsEditingBranch] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [branchStatusData, setBranchStatusData] = useState<BranchStatus | null>(null);
  const [isCheckingBranch, setIsCheckingBranch] = useState(false);

  // ── target branch selector (create mode only) ────────────────────────────
  const [targetBranch, setTargetBranch] = useState<string | null>(null);
  const [availableBranches, setAvailableBranches] = useState<BranchListItem[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);

  // ── position toggle ──────────────────────────────────────────────────────
  const [position, setPosition] = useState<"before" | "after">("after");

  // ── right panel ──────────────────────────────────────────────────────────
  const [activeRightTab, setActiveRightTab] = useState<"commits" | "changes">("commits");
  const [changedFiles, setChangedFiles] = useState<JjFileChange[]>([]);
  const [fileHunksMap, setFileHunksMap] = useState<Map<string, { hunks: JjDiffHunk[]; isLoading: boolean }>>(new Map());
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [selectedHunks, setSelectedHunks] = useState<Set<string>>(new Set());
  const [workspaceStatus, setWorkspaceStatus] = useState<WorkspaceStatus | null>(null);
  const [selectedCommits, setSelectedCommits] = useState<Set<string>>(new Set());
  const [dataLoading, setDataLoading] = useState(false);
  const [allWorkspaces, setAllWorkspaces] = useState<Workspace[]>([]);

  // ── move to existing workspace ────────────────────────────────────────────
  const [moveToExisting, setMoveToExisting] = useState(false);
  const [targetWorkspaceId, setTargetWorkspaceId] = useState<number | null>(null);

  const { addToast } = useToast();
  const checkBranchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { createStackedWorkspace } = useCreateStackedWorkspace();

  // ── derived ──────────────────────────────────────────────────────────────
  const isHomeRepo = defaults.sourceWorkspace === null; // explicitly null
  const hasSourceWorkspace = defaults.sourceWorkspace !== undefined; // null or Workspace
  const sourceWorkspace = defaults.sourceWorkspace ?? null;
  const showRightPanel = hasSourceWorkspace || isHomeRepo;
  const commitsAhead = workspaceStatus?.commits_ahead_of_target ?? [];

  const branchStatus: "new" | "local" | "remote" | "checking" | null =
    isCheckingBranch
      ? "checking"
      : branchStatusData
      ? branchStatusData.local_exists
        ? "local"
        : branchStatusData.remote_exists
        ? "remote"
        : "new"
      : null;

  // ── reset form on open ───────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;

    setError("");
    setBranchStatusData(null);
    setIsEditingBranch(false);
    setLoading(false);
    setMoveToExisting(false);
    setTargetWorkspaceId(null);

    // Set initial tab from defaults
    if (defaults.activeTab) {
      setActiveRightTab(defaults.activeTab);
    } else {
      setActiveRightTab("commits");
    }

    // Set initial intent / branch name from defaults
    const initIntent = defaults.intent ?? "";
    setIntent(initIntent);

    if (defaults.branchName) {
      setBranchName(defaults.branchName);
      setIsEditingBranch(true);
    } else {
      setBranchName("");
      setIsEditingBranch(false);
    }

    // Set target branch
    setTargetBranch(defaults.targetBranch ?? null);

    // Reset selections
    setSelectedHunks(new Set());
    setFileHunksMap(new Map());
    setExpandedFiles(new Set());
    setSelectedCommits(new Set(defaults.preSelectedCommits ?? []));

    // Load workspace data if there's a source workspace
    if (sourceWorkspace) {
      const fullPath = getFullWorkspacePath(sourceWorkspace);
      setDataLoading(true);
      Promise.all([
        getWorkspaceStatus(repoPath, sourceWorkspace.id),
        jjGetChangedFiles(fullPath),
        getWorkspaces(repoPath),
      ])
        .then(([status, files, workspaceList]) => {
          setWorkspaceStatus(status);
          setChangedFiles(files);
          setAllWorkspaces(workspaceList);
          // Set first other workspace as default for "move to existing"
          const others = workspaceList.filter((w) => w.id !== sourceWorkspace.id);
          if (others.length > 0) setTargetWorkspaceId(others[0].id);
        })
        .catch((err) => {
          console.error("Failed to load workspace data:", err);
          setWorkspaceStatus(null);
          setChangedFiles([]);
        })
        .finally(() => setDataLoading(false));
    } else if (isHomeRepo) {
      // Home repo: load changed files + workspaces + branches (for selector)
      setDataLoading(true);
      Promise.all([jjGetChangedFiles(repoPath), getWorkspaces(repoPath)])
        .then(([files, workspaceList]) => {
          setChangedFiles(files);
          setAllWorkspaces(workspaceList);
        })
        .catch(() => {
          setChangedFiles([]);
        })
        .finally(() => setDataLoading(false));

      // Load branches for the target branch selector
      setBranchesLoading(true);
      jjGitFetchBackground(repoPath).catch(() => {});
      jjGetBranches(repoPath)
        .then((branches) => {
          setAvailableBranches(
            branches.map((b) => ({
              name: b.name,
              full_name: b.name,
              is_current: b.is_current,
            }))
          );
        })
        .catch(() => setAvailableBranches([]))
        .finally(() => setBranchesLoading(false));
    } else {
      // Plain create mode: load workspaces + branches
      setChangedFiles([]);
      setWorkspaceStatus(null);
      getWorkspaces(repoPath)
        .then(setAllWorkspaces)
        .catch(() => setAllWorkspaces([]));

      if (!defaults.targetBranch) {
        // Fetch branches for target branch selector
        setBranchesLoading(true);
        jjGitFetchBackground(repoPath).catch(() => {});
        jjGetBranches(repoPath)
          .then((branches) => {
            setAvailableBranches(
              branches.map((b) => ({
                name: b.name,
                full_name: b.name,
                is_current: b.is_current,
              }))
            );
          })
          .catch(() => setAvailableBranches([]))
          .finally(() => setBranchesLoading(false));
      }
    }
  }, [open]);

  // ── load branch pattern ──────────────────────────────────────────────────
  useEffect(() => {
    if (open && repoPath) {
      getRepoSetting(repoPath, "branch_name_pattern")
        .then((pattern) => setBranchPattern(pattern || "treq/{name}"))
        .catch(() => setBranchPattern("treq/{name}"));
    }
  }, [open, repoPath]);

  // ── auto-generate branch name from intent ────────────────────────────────
  useEffect(() => {
    if (!isEditingBranch && intent.trim()) {
      setBranchName(applyBranchNamePattern(branchPattern, intent));
    } else if (!isEditingBranch && !intent.trim()) {
      setBranchName("");
    }
  }, [intent, branchPattern, isEditingBranch]);

  // ── check branch existence ───────────────────────────────────────────────
  useEffect(() => {
    if (checkBranchTimeoutRef.current) clearTimeout(checkBranchTimeoutRef.current);
    if (!branchName.trim()) {
      setBranchStatusData(null);
      setIsCheckingBranch(false);
      return;
    }
    if (moveToExisting) return; // not needed in "move to existing" mode
    setIsCheckingBranch(true);
    checkBranchTimeoutRef.current = setTimeout(async () => {
      try {
        const status = await checkBranchExists(repoPath, branchName);
        setBranchStatusData(status);
      } catch {
        setBranchStatusData({ local_exists: false, remote_exists: false });
      } finally {
        setIsCheckingBranch(false);
      }
    }, 500);
    return () => {
      if (checkBranchTimeoutRef.current) clearTimeout(checkBranchTimeoutRef.current);
    };
  }, [branchName, repoPath, moveToExisting]);

  // ── selections ───────────────────────────────────────────────────────────
  const toggleCommit = useCallback((changeId: string) => {
    setSelectedCommits((prev) => {
      const next = new Set(prev);
      if (next.has(changeId)) next.delete(changeId);
      else next.add(changeId);
      return next;
    });
  }, []);

  // ── hunk helpers ─────────────────────────────────────────────────────────
  const hunkKey = (filePath: string, hunkId: string) => `${filePath}::${hunkId}`;

  const hunkSourcePath = sourceWorkspace ? getFullWorkspacePath(sourceWorkspace) : repoPath;

  const handleToggleFileExpand = useCallback((filePath: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
    // Lazy-load hunks on first expand
    setFileHunksMap((prev) => {
      if (prev.has(filePath)) return prev;
      const next = new Map(prev);
      next.set(filePath, { hunks: [], isLoading: true });
      return next;
    });
  }, []);

  // Trigger actual load when fileHunksMap shows isLoading=true
  useEffect(() => {
    for (const [filePath, data] of fileHunksMap) {
      if (data.isLoading && data.hunks.length === 0) {
        jjGetFileHunks(hunkSourcePath, filePath)
          .then((hunks) =>
            setFileHunksMap((prev) => new Map(prev).set(filePath, { hunks, isLoading: false }))
          )
          .catch(() =>
            setFileHunksMap((prev) => new Map(prev).set(filePath, { hunks: [], isLoading: false }))
          );
      }
    }
  }, [fileHunksMap]);

  const getFileSelectionState = useCallback(
    (filePath: string): "all" | "some" | "none" => {
      const hunkData = fileHunksMap.get(filePath);
      if (!hunkData || hunkData.hunks.length === 0) return "none";
      const keys = hunkData.hunks.map((h) => hunkKey(filePath, h.id));
      const count = keys.filter((k) => selectedHunks.has(k)).length;
      if (count === 0) return "none";
      if (count === keys.length) return "all";
      return "some";
    },
    [fileHunksMap, selectedHunks]
  );

  const toggleFileHunks = useCallback(
    (filePath: string) => {
      const hunkData = fileHunksMap.get(filePath);
      if (!hunkData || hunkData.isLoading) {
        handleToggleFileExpand(filePath);
        return;
      }
      const allKeys = hunkData.hunks.map((h) => hunkKey(filePath, h.id));
      const allSelected = allKeys.length > 0 && allKeys.every((k) => selectedHunks.has(k));
      setSelectedHunks((prev) => {
        const next = new Set(prev);
        if (allSelected) allKeys.forEach((k) => next.delete(k));
        else allKeys.forEach((k) => next.add(k));
        return next;
      });
    },
    [fileHunksMap, selectedHunks, handleToggleFileExpand]
  );

  const toggleHunk = useCallback((key: string) => {
    setSelectedHunks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectAllHunks = useCallback(() => {
    const allKeys: string[] = [];
    for (const [path, data] of fileHunksMap) {
      for (const hunk of data.hunks) allKeys.push(hunkKey(path, hunk.id));
    }
    setSelectedHunks(new Set(allKeys));
  }, [fileHunksMap]);

  // ── selected file paths (derived from selectedHunks) ─────────────────────
  const selectedFilePaths = useMemo(() => {
    const paths = new Set<string>();
    for (const key of selectedHunks) {
      const idx = key.indexOf("::");
      if (idx !== -1) paths.add(key.slice(0, idx));
    }
    return Array.from(paths);
  }, [selectedHunks]);

  // ── isStackOnRoot ────────────────────────────────────────────────────────
  const isStackOnRoot =
    hasSourceWorkspace &&
    sourceWorkspace !== null &&
    (!sourceWorkspace.target_branch ||
      !allWorkspaces.some((w) => w.branch_name === sourceWorkspace.target_branch));

  useEffect(() => {
    if (isStackOnRoot && position !== "after") setPosition("after");
  }, [isStackOnRoot, position]);

  // ── tree preview ─────────────────────────────────────────────────────────
  const treePreview: TreeLine[] = (() => {
    if (sourceWorkspace) {
      if (workspaceStatus) {
        return buildTreePreview(
          workspaceStatus.dag_nodes ?? [],
          sourceWorkspace,
          position,
          branchName || "[New Workspace]"
        );
      }
      return buildStackTreePreview(
        allWorkspaces,
        sourceWorkspace,
        sourceWorkspace.branch_name,
        position,
        branchName || "[New Workspace]"
      );
    }
    if (targetBranch) {
      return buildStackTreePreview(
        allWorkspaces,
        null,
        targetBranch,
        position,
        branchName || "[New Workspace]"
      );
    }
    return [];
  })();

  // ── canSubmit ────────────────────────────────────────────────────────────
  const canSubmit = (() => {
    if (loading) return false;
    if (moveToExisting) {
      const hasSelection = activeRightTab === "commits"
        ? selectedCommits.size > 0
        : selectedHunks.size > 0;
      return hasSelection && targetWorkspaceId !== null;
    }
    if (!branchName.trim()) return false;
    return true;
  })();

  // ── submit logic ─────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError("");

    try {
      // Case 1: Move to existing workspace
      if (moveToExisting && targetWorkspaceId !== null && sourceWorkspace) {
        if (activeRightTab === "commits" && selectedCommits.size > 0) {
          // Move each selected commit to the existing workspace
          for (const changeId of selectedCommits) {
            await moveCommitToExistingWorkspace(
              repoPath,
              sourceWorkspace.id,
              changeId,
              targetWorkspaceId,
            );
          }
          const targetWs = allWorkspaces.find((w) => w.id === targetWorkspaceId);
          addToast({
            title: "Commits moved",
            description: `Moved to workspace: ${targetWs?.branch_name ?? ""}`,
            type: "success",
          });
          onSuccess(targetWorkspaceId);
          onOpenChange(false);
          return;
        } else if (activeRightTab === "changes" && selectedHunks.size > 0) {
          // File-level move to existing: use splitWorkspace approach
          // For now, fall through to creating a new workspace for files
          // (file-level "move to existing" isn't supported by the API yet)
          setError("Moving files to an existing workspace is not yet supported. Please create a new workspace instead.");
          setLoading(false);
          return;
        }
        setError("Please select commits to move");
        setLoading(false);
        return;
      }

      // Case 2: Split workspace (source workspace + commits selected)
      if (sourceWorkspace && selectedCommits.size > 0 && activeRightTab === "commits") {
        const newWorkspaceId = await splitWorkspace(
          repoPath,
          sourceWorkspace.id,
          branchName,
          intent.trim() || null,
          null,
          Array.from(selectedCommits),
          "move",
          position
        );
        addToast({
          title: "Workspace created",
          description: `Moved ${selectedCommits.size} commit(s) to ${branchName}`,
          type: "success",
        });
        onSuccess(newWorkspaceId);
        onOpenChange(false);
        return;
      }

      // Case 3: Split workspace (source workspace + files selected)
      if (sourceWorkspace && selectedHunks.size > 0 && activeRightTab === "changes") {
        const newWorkspaceId = await splitWorkspace(
          repoPath,
          sourceWorkspace.id,
          branchName,
          intent.trim() || null,
          selectedFilePaths,
          null,
          "move",
          position
        );
        addToast({
          title: "Workspace split",
          description: `Moved ${selectedFilePaths.length} file(s) to ${branchName}`,
          type: "success",
        });
        onSuccess(newWorkspaceId);
        onOpenChange(false);
        return;
      }

      // Case 4: Home repo + files selected → createWorkspace with moved_files
      if (isHomeRepo && selectedHunks.size > 0) {
        const metadata = JSON.stringify({
          intent: intent.trim() || undefined,
          moved_files: selectedFilePaths,
        });
        const workspaceId = await createWorkspace(repoPath, branchName, undefined, metadata);
        addToast({
          title: "Workspace created",
          description: `Created ${branchName} with ${selectedFilePaths.length} file(s) moved`,
          type: "success",
        });
        onSuccess(workspaceId);
        onOpenChange(false);
        return;
      }

      // Case 5: Has source workspace + nothing selected → plain stack
      if (hasSourceWorkspace && sourceWorkspace) {
        const workspaceId = await createStackedWorkspace({
          repoPath,
          parentBranch: sourceWorkspace.branch_name,
          parentWorkspace: sourceWorkspace,
          branchName,
          intent: intent.trim() || undefined,
          position,
        });
        onSuccess(workspaceId);
        onOpenChange(false);
        return;
      }

      // Case 6: Plain create (no source workspace context)
      {
        let targetWorkspacePath: string | undefined;
        if (targetBranch) {
          const existingTarget = allWorkspaces.find((w) => w.branch_name === targetBranch);
          if (!existingTarget) {
            const targetWsId = await createWorkspace(
              repoPath,
              targetBranch,
              undefined,
              JSON.stringify({ intent: `Workspace for ${targetBranch}` })
            );
            const updatedWorkspaces = await getWorkspaces(repoPath);
            const createdTarget = updatedWorkspaces.find((w) => w.id === targetWsId);
            if (createdTarget) targetWorkspacePath = createdTarget.workspace_path;
          } else {
            targetWorkspacePath = existingTarget.workspace_path;
          }
        }

        const metadata = intent.trim()
          ? JSON.stringify({ intent: intent.trim() })
          : JSON.stringify({});

        let effectiveSourceBranch: string | undefined;
        if (branchStatusData?.remote_exists && branchStatusData.remote_ref) {
          effectiveSourceBranch = branchStatusData.remote_ref;
        }

        const workspaceId = await createWorkspace(repoPath, branchName, effectiveSourceBranch, metadata);

        if (targetBranch && targetWorkspacePath) {
          const updatedWorkspaces = await getWorkspaces(repoPath);
          const createdWorkspace = updatedWorkspaces.find((w) => w.id === workspaceId);
          if (createdWorkspace) {
            const fullPath = getFullWorkspacePath(createdWorkspace);
            await setWorkspaceTargetBranch(repoPath, fullPath, workspaceId, targetBranch);
          }
        }

        addToast({
          title: "Workspace created",
          description: `Created workspace for branch ${branchName}`,
          type: "success",
        });
        onSuccess(workspaceId);
        onOpenChange(false);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      addToast({
        title: "Failed to create workspace",
        description: errorMsg,
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onOpenChange(false);
    }
  };

  // ── helpers ──────────────────────────────────────────────────────────────
  const statusIcon = (status: string) => {
    switch (status) {
      case "modified": return "M";
      case "added": return "A";
      case "deleted": return "D";
      case "renamed": return "R";
      default: return "?";
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "modified": return "text-yellow-500";
      case "added": return "text-green-500";
      case "deleted": return "text-red-500";
      case "renamed": return "text-blue-500";
      default: return "text-muted-foreground";
    }
  };

  const submitLabel = (() => {
    if (loading) return "Creating...";
    if (moveToExisting) {
      const count = activeRightTab === "commits" ? selectedCommits.size : selectedHunks.size;
      return count > 0 ? `Move ${count} to Existing Workspace` : "Move to Existing Workspace";
    }
    if (sourceWorkspace && (selectedCommits.size > 0 || selectedHunks.size > 0)) {
      const count = selectedCommits.size + selectedFilePaths.length;
      return `Split ${count} item${count !== 1 ? "s" : ""}`;
    }
    if (isHomeRepo && selectedHunks.size > 0) {
      return `Create with ${selectedFilePaths.length} file(s)`;
    }
    return "Create Workspace";
  })();

  const otherWorkspaces = allWorkspaces.filter((w) => w.id !== sourceWorkspace?.id);

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "overflow-hidden",
          showRightPanel ? "md:min-w-[800px] md:max-w-[900px]" : "md:min-w-[500px]"
        )}
        onKeyDown={handleKeyDown}
      >
        <DialogHeader>
          <DialogTitle>Stack a new Workspace</DialogTitle>
          <DialogDescription>
            {sourceWorkspace
              ? `Create a new workspace stacked on ${sourceWorkspace.branch_name}. Optionally move commits or file changes.`
              : isHomeRepo
              ? "Create a new workspace from the current branch. Optionally move file changes."
              : "Create a new workspace for parallel development."}
          </DialogDescription>
        </DialogHeader>

        <div className={cn("flex gap-4 mt-2", showRightPanel ? "min-h-[320px]" : "")}>
          {/* ── LEFT PANEL ─────────────────────────────────────────────── */}
          <div className={cn("flex flex-col gap-3", showRightPanel ? "w-[280px] flex-shrink-0" : "w-full")}>
            {/* Stacking On - always show */}
            <div className="grid gap-1.5">
              <Label className="text-xs">Stacking On</Label>
              {sourceWorkspace ? (
                <Input
                  value={
                    position === "before" && sourceWorkspace.target_branch
                      ? sourceWorkspace.target_branch
                      : sourceWorkspace.branch_name
                  }
                  disabled
                  className="text-xs text-muted-foreground h-8"
                />
              ) : (
                <TargetBranchSelector
                  branches={(() => {
                    if (!branchName) return availableBranches;
                    const validTargets = getValidTargets(allWorkspaces, branchName);
                    return availableBranches.filter((b) => validTargets.includes(b.name));
                  })()}
                  loading={branchesLoading}
                  targetBranch={targetBranch}
                  onSelect={setTargetBranch}
                  disabled={loading}
                />
              )}
            </div>

            {/* Position toggle - show when sourceWorkspace (not root) or when targetBranch chosen */}
            {((sourceWorkspace && !isStackOnRoot) || (!sourceWorkspace && targetBranch)) && (
              <div className="flex items-center gap-2">
                <Label className="text-xs whitespace-nowrap">Position:</Label>
                <div className="flex gap-1 bg-muted p-0.5 rounded-md">
                  {(["before", "after"] as const).map((pos) => (
                    <button
                      key={pos}
                      type="button"
                      onClick={() => setPosition(pos)}
                      className={cn(
                        "px-2.5 py-1 text-xs font-medium rounded transition-colors capitalize",
                        position === pos
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {pos}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Stack tree preview */}
            {treePreview.length > 0 && (
              <div className="bg-muted/50 rounded-md p-2 text-xs font-mono flex-shrink-0">
                {treePreview.map((line, i) => (
                  <div
                    key={i}
                    className={cn(
                      "leading-5",
                      line.isNew && "text-green-500 font-semibold",
                      line.isCurrent && "text-foreground font-semibold",
                      !line.isNew && !line.isCurrent && "text-muted-foreground"
                    )}
                    style={{ paddingLeft: `${line.depth * 12}px` }}
                  >
                    {line.depth > 0 && <span className="text-muted-foreground">{"└─ "}</span>}
                    {line.label}
                    {line.isCurrent && <span className="text-muted-foreground font-normal"> (current)</span>}
                    {line.isNew && <span className="text-green-500/70 font-normal"> (new)</span>}
                  </div>
                ))}
              </div>
            )}

            {/* Move to existing workspace toggle */}
            {hasSourceWorkspace && sourceWorkspace && (
              <div className="border-t border-border/50 pt-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={moveToExisting}
                    onChange={(e) => setMoveToExisting(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-xs text-muted-foreground">Move to existing workspace instead</span>
                </label>
              </div>
            )}

            {/* Existing workspace dropdown (when moveToExisting is on) */}
            {moveToExisting && (
              <div className="grid gap-1.5">
                <Label className="text-xs">Target Workspace</Label>
                {otherWorkspaces.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No other workspaces available.</p>
                ) : (
                  <select
                    className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={targetWorkspaceId ?? ""}
                    onChange={(e) => setTargetWorkspaceId(Number(e.target.value))}
                  >
                    {otherWorkspaces.map((w) => (
                      <option key={w.id} value={w.id}>{w.branch_name}</option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Intent (hidden when moveToExisting) */}
            {!moveToExisting && (
              <div className="grid gap-1.5">
                <Label htmlFor="intent" className="text-xs">Intent / Description (optional)</Label>
                <Textarea
                  id="intent"
                  value={intent}
                  onChange={(e) => setIntent(e.target.value)}
                  placeholder="e.g., Add dark mode to settings"
                  rows={2}
                  className="resize-none text-sm"
                  autoFocus={!hasSourceWorkspace}
                  tabIndex={1}
                />
              </div>
            )}

            {/* Branch name (hidden when moveToExisting) */}
            {!moveToExisting && (
              <div className="grid gap-1.5">
                <Label htmlFor="branch" className="text-xs">Branch Name</Label>
                <div className="relative">
                  <Input
                    id="branch"
                    value={branchName}
                    onChange={(e) => {
                      setBranchName(e.target.value);
                      setIsEditingBranch(true);
                    }}
                    placeholder={branchPattern.replace("{name}", "example")}
                    className="pr-8 text-sm h-8"
                    tabIndex={2}
                  />
                  {branchStatus && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      {branchStatus === "checking" && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                      )}
                      {branchStatus === "new" && (
                        <Check className="w-3.5 h-3.5 text-green-500" />
                      )}
                      {branchStatus === "local" && (
                        <AlertCircle className="w-3.5 h-3.5 text-yellow-500" />
                      )}
                      {branchStatus === "remote" && (
                        <Cloud className="w-3.5 h-3.5 text-blue-500" />
                      )}
                    </div>
                  )}
                </div>
                {branchStatus === "local" && (
                  <p className="text-xs text-yellow-500">Branch already exists locally</p>
                )}
                {branchStatus === "remote" && (
                  <p className="text-xs text-blue-500">Branch exists on remote — will check out</p>
                )}
              </div>
            )}
          </div>

          {/* ── RIGHT PANEL ────────────────────────────────────────────── */}
          {showRightPanel && (
            <div className="flex-1 border-l border-border pl-4 flex flex-col min-w-0">
              {dataLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading...</span>
                </div>
              ) : (
                <Tabs
                  value={activeRightTab}
                  onValueChange={(v) => setActiveRightTab(v as "commits" | "changes")}
                  className="flex flex-col flex-1"
                >
                  <TabsList className="text-xs self-start mb-2">
                    <TabsTrigger value="commits" className="text-xs">
                      Commits ({commitsAhead.length})
                    </TabsTrigger>
                    <TabsTrigger value="changes" className="text-xs">
                      Changes ({changedFiles.length})
                    </TabsTrigger>
                  </TabsList>

                  {/* ── Commits tab ── */}
                  <TabsContent value="commits" className="flex-1 flex flex-col mt-0">
                    <div className="flex-1 overflow-y-auto border rounded-md max-h-[280px]">
                      {commitsAhead.length === 0 ? (
                        <div className="p-4 text-sm text-muted-foreground text-center">
                          No mutable commits in this workspace
                        </div>
                      ) : (
                        commitsAhead.map((commit) => (
                          <label
                            key={commit.hash}
                            className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50 cursor-pointer border-b last:border-b-0"
                          >
                            <input
                              type="checkbox"
                              checked={selectedCommits.has(commit.hash)}
                              onChange={() => toggleCommit(commit.hash)}
                              className="rounded flex-shrink-0"
                            />
                            <span className="text-xs font-mono text-muted-foreground flex-shrink-0">
                              {commit.hash.slice(0, 8)}
                            </span>
                            <span className="text-xs truncate flex-1">
                              {commit.message || "(no description)"}
                            </span>
                          </label>
                        ))
                      )}
                    </div>
                    {commitsAhead.length > 0 && (
                      <div className="flex gap-2 mt-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedCommits(new Set(commitsAhead.map((c) => c.hash)))}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Select all
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedCommits(new Set())}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground mt-1.5">
                      Select commits to move to the new workspace
                    </p>
                  </TabsContent>

                  {/* ── Changes tab ── */}
                  <TabsContent value="changes" className="flex-1 flex flex-col mt-0">
                    <div className="flex-1 overflow-y-auto border rounded-md max-h-[280px]">
                      {changedFiles.length === 0 ? (
                        <div className="p-4 text-sm text-muted-foreground text-center">
                          No uncommitted changes
                        </div>
                      ) : (
                        changedFiles.map((file) => {
                          const hunkData = fileHunksMap.get(file.path);
                          const isExpanded = expandedFiles.has(file.path);
                          const fileState = getFileSelectionState(file.path);
                          return (
                            <div key={file.path} className="border-b last:border-b-0">
                              {/* File row */}
                              <div className="flex items-center gap-1 px-2 py-1.5 hover:bg-muted/50">
                                <button
                                  type="button"
                                  onClick={() => handleToggleFileExpand(file.path)}
                                  className="flex-shrink-0 w-4 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground"
                                >
                                  {isExpanded
                                    ? <ChevronDown className="w-3 h-3" />
                                    : <ChevronRight className="w-3 h-3" />}
                                </button>
                                <input
                                  type="checkbox"
                                  ref={(el) => {
                                    if (el) el.indeterminate = fileState === "some";
                                  }}
                                  checked={fileState === "all"}
                                  onChange={() => toggleFileHunks(file.path)}
                                  className="rounded flex-shrink-0"
                                />
                                <span className={cn("text-xs font-mono w-4 text-center flex-shrink-0", statusColor(file.status))}>
                                  {statusIcon(file.status)}
                                </span>
                                <span
                                  className="text-xs truncate flex-1 cursor-pointer"
                                  onClick={() => handleToggleFileExpand(file.path)}
                                >
                                  {file.path}
                                </span>
                              </div>
                              {/* Hunk rows */}
                              {isExpanded && (
                                <div>
                                  {hunkData?.isLoading ? (
                                    <div className="flex items-center gap-2 px-8 py-2 text-xs text-muted-foreground bg-muted/10">
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                      Loading hunks...
                                    </div>
                                  ) : !hunkData || hunkData.hunks.length === 0 ? (
                                    <div className="px-8 py-1.5 text-xs text-muted-foreground bg-muted/10">
                                      No hunks
                                    </div>
                                  ) : (
                                    hunkData.hunks.map((hunk) => {
                                      const key = hunkKey(file.path, hunk.id);
                                      return (
                                        <label
                                          key={hunk.id}
                                          className="flex items-start gap-2 px-8 py-1.5 hover:bg-muted/30 cursor-pointer bg-muted/10 border-t border-border/30"
                                        >
                                          <input
                                            type="checkbox"
                                            checked={selectedHunks.has(key)}
                                            onChange={() => toggleHunk(key)}
                                            className="rounded flex-shrink-0 mt-0.5"
                                          />
                                          <div className="flex flex-col min-w-0 overflow-hidden">
                                            <span className="text-xs font-mono text-blue-400 truncate">
                                              {hunk.header}
                                            </span>
                                            {hunk.lines.slice(0, 3).map((line, i) => (
                                              <span
                                                key={i}
                                                className={cn(
                                                  "text-xs font-mono truncate",
                                                  line.startsWith("+") ? "text-green-500" :
                                                  line.startsWith("-") ? "text-red-500" :
                                                  "text-muted-foreground"
                                                )}
                                              >
                                                {line}
                                              </span>
                                            ))}
                                            {hunk.lines.length > 3 && (
                                              <span className="text-xs text-muted-foreground">
                                                +{hunk.lines.length - 3} more lines
                                              </span>
                                            )}
                                          </div>
                                        </label>
                                      );
                                    })
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                    {changedFiles.length > 0 && (
                      <div className="flex gap-2 mt-1.5">
                        <button
                          type="button"
                          onClick={selectAllHunks}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Select all
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedHunks(new Set())}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground mt-1.5">
                      Select file changes to move to the new workspace
                    </p>
                  </TabsContent>
                </Tabs>
              )}
            </div>
          )}
        </div>

        {error && <div className="text-sm text-destructive mt-2">{error}</div>}

        <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {loading && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            {submitLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
