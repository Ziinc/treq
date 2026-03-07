import { useState, useEffect, useRef, useCallback } from "react";
import { Check, AlertCircle, Cloud, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { useToast } from "./ui/toast";
import { GitBranchPlusIcon } from "./ui/icons";
import { applyBranchNamePattern, getFullWorkspacePath } from "../lib/utils";
import {
  createWorkspace,
  getRepoSetting,
  checkBranchExists,
  jjGitFetchBackground,
  splitWorkspace,
  getWorkspaceStatus,
  jjGetChangedFiles,
  getWorkspaces,
  setWorkspaceTargetBranch,
  jjGetBranches,
  type BranchStatus,
  type Workspace,
  type WorkspaceStatus,
  type JjFileChange,
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

export type DialogMode =
  | { type: "create" }
  | { type: "stack"; parentWorkspace: Workspace | null; parentBranch: string; position: "before" | "after" }
  | { type: "split"; workspace: Workspace }
  | { type: "createFromHome"; currentBranch: string };

interface CreateWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoPath: string;
  onSuccess: (workspaceId: number) => void;
  mode: DialogMode;
}

export const CreateWorkspaceDialog: React.FC<CreateWorkspaceDialogProps> = ({
  open,
  onOpenChange,
  repoPath,
  onSuccess,
  mode,
}) => {
  // Common form state
  const [intent, setIntent] = useState("");
  const [branchName, setBranchName] = useState("");
  const [branchPattern, setBranchPattern] = useState("treq/{name}");
  const [isEditingBranch, setIsEditingBranch] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [branchStatusData, setBranchStatusData] = useState<BranchStatus | null>(null);
  const [isCheckingBranch, setIsCheckingBranch] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);

  // Create mode state
  const [targetBranch, setTargetBranch] = useState<string | null>(null);
  const [availableBranches, setAvailableBranches] = useState<BranchListItem[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);

  // Stack/Split mode state
  const [position, setPosition] = useState<"before" | "after">("after");

  // Split mode state
  const [workspaceStatus, setWorkspaceStatus] = useState<WorkspaceStatus | null>(null);
  const [changedFiles, setChangedFiles] = useState<JjFileChange[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [selectedCommits, setSelectedCommits] = useState<Set<string>>(new Set());
  const [splitMode, setSplitMode] = useState<"move" | "copy">("move");
  const [activeTab, setActiveTab] = useState<"files" | "commits">("files");
  const [dataLoading, setDataLoading] = useState(false);

  const { addToast } = useToast();
  const checkBranchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { createStackedWorkspace } = useCreateStackedWorkspace();

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

  const commitsAhead = workspaceStatus?.commits_ahead_of_target ?? [];

  // Reset form when dialog opens
  useEffect(() => {
    if (!open) return;

    // Common resets
    setError("");
    setBranchStatusData(null);
    setIsEditingBranch(false);
    setLoading(false);

    if (mode.type === "create") {
      setIntent("");
      setBranchName("");
      setTargetBranch(null);

      // Fetch remote branches
      if (repoPath) {
        jjGitFetchBackground(repoPath).catch((err) => {
          console.error("[CreateWorkspaceDialog] Failed to fetch remote branches:", err);
        });
      }
    } else if (mode.type === "createFromHome") {
      setSelectedFiles(new Set());
      setIntent("");
      setBranchName("");
      setDataLoading(true);
      Promise.all([
        jjGetChangedFiles(repoPath),
        getWorkspaces(repoPath),
      ])
        .then(([files, allWorkspaces]) => {
          setChangedFiles(files);
          setWorkspaces(allWorkspaces);
          const existingBranches = new Set(allWorkspaces.map((w) => w.branch_name));
          let index = 1;
          const base = mode.currentBranch || "main";
          let candidate = `${base}-ws-${index}`;
          while (existingBranches.has(candidate)) {
            index++;
            candidate = `${base}-ws-${index}`;
          }
          setBranchName(candidate);
          setIsEditingBranch(true);
        })
        .catch((err) => {
          console.error("Failed to load data for create from home:", err);
          setChangedFiles([]);
          setBranchName(`${mode.currentBranch || "main"}-ws-1`);
          setIsEditingBranch(true);
        })
        .finally(() => {
          setDataLoading(false);
        });
    } else if (mode.type === "stack") {
      setPosition(mode.position);

      setIntent(`Stacked on ${mode.parentBranch}`);

      // Branch name will be auto-generated from intent via the effect below
      // But we also want a default stacked name
      setBranchName(""); // Will be set by the intent→branchName effect
    } else if (mode.type === "split") {
      setPosition("after");
      setSelectedFiles(new Set());
      setSelectedCommits(new Set());
      setSplitMode("move");
      setActiveTab("files");

      // Auto-generate intent from source workspace
      let sourceIntent: string | null = null;
      try {
        if (mode.workspace.metadata) {
          const meta = JSON.parse(mode.workspace.metadata);
          sourceIntent = meta.intent || null;
        }
      } catch { /* ignore */ }
      setIntent(sourceIntent ? `Split from: ${sourceIntent}` : "");

      // Fetch workspace status, changed files, and existing workspaces for unique naming
      const fullPath = getFullWorkspacePath(mode.workspace);
      setDataLoading(true);
      Promise.all([
        getWorkspaceStatus(repoPath, mode.workspace.id),
        jjGetChangedFiles(fullPath),
        getWorkspaces(repoPath),
      ])
        .then(([status, files, allWorkspaces]) => {
          setWorkspaceStatus(status);
          setChangedFiles(files);
          setWorkspaces(allWorkspaces);

          // Auto-generate branch name with -split-{N} suffix
          const existingBranches = new Set(allWorkspaces.map((w) => w.branch_name));
          let index = 1;
          let candidate = `${mode.workspace.branch_name}-split-${index}`;
          while (existingBranches.has(candidate)) {
            index++;
            candidate = `${mode.workspace.branch_name}-split-${index}`;
          }
          setBranchName(candidate);
          setIsEditingBranch(true); // Don't override with intent pattern
        })
        .catch((err) => {
          console.error("Failed to load workspace data for split:", err);
          setWorkspaceStatus(null);
          setChangedFiles([]);
          setBranchName(`${mode.workspace.branch_name}-split-1`);
          setIsEditingBranch(true);
        })
        .finally(() => {
          setDataLoading(false);
        });
    }
  }, [open, mode, repoPath]);

  // Load workspaces and branches when dialog opens (create and stack modes)
  useEffect(() => {
    if (open && repoPath && mode.type !== "split" && mode.type !== "createFromHome") {
      getWorkspaces(repoPath)
        .then(setWorkspaces)
        .catch((err) => console.error("Failed to load workspaces:", err));

      if (mode.type === "create") {
        setBranchesLoading(true);
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
          .catch((err) => {
            console.error("Failed to load branches:", err);
            setAvailableBranches([]);
          })
          .finally(() => setBranchesLoading(false));
      }
    }
  }, [open, repoPath, mode.type]);

  // Load branch pattern from repository settings
  useEffect(() => {
    if (open && repoPath) {
      getRepoSetting(repoPath, "branch_name_pattern")
        .then((pattern) => setBranchPattern(pattern || "treq/{name}"))
        .catch(() => setBranchPattern("treq/{name}"));
    }
  }, [open, repoPath]);

  // Auto-generate branch name from intent (create and stack modes only)
  useEffect(() => {
    if (mode.type === "split" || mode.type === "createFromHome") return; // Split/createFromHome have their own branch naming
    if (!isEditingBranch && intent.trim()) {
      const generatedBranch = applyBranchNamePattern(branchPattern, intent);
      setBranchName(generatedBranch);
    } else if (!isEditingBranch && !intent.trim()) {
      setBranchName("");
    }
  }, [intent, branchPattern, isEditingBranch, mode.type]);

  // Check branch existence with debouncing
  useEffect(() => {
    if (checkBranchTimeoutRef.current) {
      clearTimeout(checkBranchTimeoutRef.current);
    }
    if (!branchName.trim()) {
      setBranchStatusData(null);
      setIsCheckingBranch(false);
      return;
    }
    setIsCheckingBranch(true);
    checkBranchTimeoutRef.current = setTimeout(async () => {
      try {
        const status = await checkBranchExists(repoPath, branchName);
        setBranchStatusData(status);
      } catch {
        setBranchStatusData({
          local_exists: false,
          remote_exists: false,
          remote_name: undefined,
          remote_ref: undefined,
        });
      } finally {
        setIsCheckingBranch(false);
      }
    }, 500);
    return () => {
      if (checkBranchTimeoutRef.current) {
        clearTimeout(checkBranchTimeoutRef.current);
      }
    };
  }, [branchName, repoPath]);

  // When switching to commits tab, force move mode
  useEffect(() => {
    if (activeTab === "commits") {
      setSplitMode("move");
    }
  }, [activeTab]);

  const toggleFile = useCallback((path: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const toggleCommit = useCallback((changeId: string) => {
    setSelectedCommits((prev) => {
      const next = new Set(prev);
      if (next.has(changeId)) next.delete(changeId);
      else next.add(changeId);
      return next;
    });
  }, []);

  // Determine if submit is allowed
  const canSubmit = (() => {
    if (loading) return false;
    if (!branchName.trim()) return false;
    if (mode.type === "split") {
      const hasSelection = activeTab === "files" ? selectedFiles.size > 0 : selectedCommits.size > 0;
      return hasSelection;
    }
    if (mode.type === "createFromHome") return true;
    return true;
  })();

  // --- Submission handlers ---

  const handleCreateSubmit = async () => {
    if (!branchName.trim()) {
      setError("Branch name is required");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // If target branch selected, check if workspace exists for it
      let targetWorkspacePath: string | undefined;
      if (targetBranch) {
        const existingTarget = workspaces.find((w) => w.branch_name === targetBranch);
        if (!existingTarget) {
          const targetWorkspaceId = await createWorkspace(
            repoPath,
            targetBranch,
            undefined,
            JSON.stringify({ intent: `Workspace for ${targetBranch}` })
          );
          const updatedWorkspaces = await getWorkspaces(repoPath);
          const createdTarget = updatedWorkspaces.find((w) => w.id === targetWorkspaceId);
          if (createdTarget) targetWorkspacePath = createdTarget.workspace_path;
          addToast({
            title: "Target workspace created",
            description: `Created workspace for ${targetBranch}`,
            type: "success",
          });
        } else {
          targetWorkspacePath = existingTarget.workspace_path;
        }
      }

      const metadata = intent.trim()
        ? JSON.stringify({ intent: intent.trim() })
        : JSON.stringify({});

      let effectiveSourceBranch: string | undefined;
      if (branchStatusData?.local_exists) {
        effectiveSourceBranch = undefined;
      } else if (branchStatusData?.remote_exists && branchStatusData.remote_ref) {
        effectiveSourceBranch = branchStatusData.remote_ref;
      }

      const workspaceId = await createWorkspace(
        repoPath,
        branchName,
        effectiveSourceBranch,
        metadata
      );

      if (targetBranch && targetWorkspacePath) {
        const updatedWorkspaces = await getWorkspaces(repoPath);
        const createdWorkspace = updatedWorkspaces.find((w) => w.id === workspaceId);
        if (createdWorkspace) {
          const fullPath = getFullWorkspacePath(createdWorkspace);
          await setWorkspaceTargetBranch(repoPath, fullPath, workspaceId, targetBranch);
        }
      }

      addToast({
        title: "Workspace created successfully",
        description: `Created workspace for branch ${branchName}`,
        type: "success",
      });

      onSuccess(workspaceId);
      onOpenChange(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      addToast({ title: "Failed to create workspace", description: errorMsg, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleStackSubmit = async () => {
    if (!branchName.trim()) {
      setError("Branch name is required");
      return;
    }
    if (mode.type !== "stack") return;

    setLoading(true);
    setError("");

    try {
      const workspaceId = await createStackedWorkspace({
        repoPath,
        parentBranch: mode.parentBranch,
        parentWorkspace: mode.parentWorkspace,
        branchName,
        intent: intent.trim() || undefined,
        position,
      });

      onSuccess(workspaceId);
      onOpenChange(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleSplitSubmit = async () => {
    if (mode.type !== "split" || !canSubmit) return;

    setLoading(true);
    setError("");

    try {
      const newWorkspaceId = await splitWorkspace(
        repoPath,
        mode.workspace.id,
        branchName,
        intent.trim() || null,
        activeTab === "files" ? Array.from(selectedFiles) : null,
        activeTab === "commits" ? Array.from(selectedCommits) : null,
        splitMode,
        position
      );

      addToast({
        title: "Workspace split successfully",
        description: `Created new workspace ${branchName}`,
        type: "success",
      });

      onSuccess(newWorkspaceId);
      onOpenChange(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      addToast({ title: "Failed to split workspace", description: errorMsg, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFromHomeSubmit = async () => {
    if (mode.type !== "createFromHome") return;

    setLoading(true);
    setError("");

    try {
      const metadata = JSON.stringify({
        intent: intent.trim() || undefined,
        moved_files: selectedFiles.size > 0 ? Array.from(selectedFiles) : undefined,
      });

      const workspaceId = await createWorkspace(
        repoPath,
        branchName,
        undefined,
        metadata
      );

      addToast({
        title: "Workspace created",
        description: selectedFiles.size > 0
          ? `Created ${branchName} with ${selectedFiles.size} file(s) moved`
          : `Created workspace for branch ${branchName}`,
        type: "success",
      });

      onSuccess(workspaceId);
      onOpenChange(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      addToast({ title: "Failed to create workspace", description: errorMsg, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = () => {
    if (mode.type === "create") handleCreateSubmit();
    else if (mode.type === "stack") handleStackSubmit();
    else if (mode.type === "split") handleSplitSubmit();
    else if (mode.type === "createFromHome") handleCreateFromHomeSubmit();
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

  // --- Tree preview ---
  const treePreview: TreeLine[] = (() => {
    if (mode.type === "stack") {
      return buildStackTreePreview(
        workspaces,
        mode.parentWorkspace,
        mode.parentBranch,
        position,
        branchName || "[New Workspace]"
      );
    }
    if (mode.type === "split") {
      return buildTreePreview(
        workspaceStatus?.dag_nodes ?? [],
        mode.workspace,
        position,
        branchName || "[New Workspace]"
      );
    }
    return [];
  })();

  // --- UI helpers ---
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

  const dialogTitle = mode.type === "create"
    ? "Create New Workspace"
    : mode.type === "stack"
    ? "Create Stacked Workspace"
    : mode.type === "createFromHome"
    ? "Create Workspace from Branch"
    : "Split Workspace";

  const dialogDescription = mode.type === "create"
    ? "Create a new workspace for parallel development"
    : mode.type === "stack"
    ? `Create a stacked workspace on ${mode.type === "stack" ? mode.parentBranch : ""}`
    : mode.type === "createFromHome"
    ? "Create a workspace from the current branch. Optionally select file changes to move into the new workspace."
    : "Move or copy files/commits to a new workspace";

  // In stack mode, if parent workspace targets the default/external branch (root of stack),
  // disable position toggle and force "after" — can't insert before the root.
  const isStackOnRoot = mode.type === "stack" && (
    !mode.parentWorkspace?.target_branch ||
    !workspaces.some(w => w.branch_name === mode.parentWorkspace?.target_branch)
  );

  // Force position to "after" when stacking on root
  useEffect(() => {
    if (isStackOnRoot && position !== "after") {
      setPosition("after");
    }
  }, [isStackOnRoot, position]);

  const dialogWidth = "md:min-w-[500px]"

  const submitLabel = (() => {
    if (loading) {
      if (mode.type === "create") return "Creating...";
      if (mode.type === "stack") return "Creating...";
      if (mode.type === "createFromHome") return "Creating...";
      return "Splitting...";
    }
    if (mode.type === "split") {
      const count = selectedFiles.size + selectedCommits.size;
      return `Split ${count} item${count !== 1 ? "s" : ""}`;
    }
    if (mode.type === "createFromHome") {
      return selectedFiles.size > 0 ? `Create with ${selectedFiles.size} file(s)` : "Create Workspace";
    }
    return "Create";
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={dialogWidth} onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Loading state for split mode */}
          {(mode.type === "split" || mode.type === "createFromHome") && dataLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">
                {mode.type === "createFromHome" ? "Loading changed files..." : "Loading workspace data..."}
              </span>
            </div>
          )}

          {!((mode.type === "split" || mode.type === "createFromHome") && dataLoading) && (
            <>
              {/* Target branch selector (create mode only) — first in form */}
              {mode.type === "create" && (
                <div className="grid gap-2">
                  <Label>Target Branch (optional)</Label>
                  <TargetBranchSelector
                    branches={(() => {
                      if (!branchName) return availableBranches;
                      const validTargets = getValidTargets(workspaces, branchName);
                      return availableBranches.filter((b) => validTargets.includes(b.name));
                    })()}
                    loading={branchesLoading}
                    targetBranch={targetBranch}
                    onSelect={setTargetBranch}
                    disabled={loading}
                  />
                  <p className="text-sm text-muted-foreground">
                    Select a target branch for this workspace to stack on
                  </p>
                </div>
              )}

              {/* Target branch display (stack mode - read-only) — first in form */}
              {mode.type === "stack" && (
                <div className="grid gap-2">
                  <Label>Target Branch</Label>
                  <Input
                    value={position === "before" && mode.parentWorkspace?.target_branch
                      ? mode.parentWorkspace.target_branch
                      : mode.parentBranch}
                    disabled
                    className="text-muted-foreground"
                  />
                </div>
              )}

              {/* Position toggle + Mode toggle (stack and split modes) */}
              {(mode.type === "stack" || mode.type === "split") && (
                <div className="flex items-center gap-4">
                  {/* Move/Copy toggle (split only) */}
                  {mode.type === "split" && (
                    <div className="flex items-center gap-2">
                      <Label className="text-sm whitespace-nowrap">Mode:</Label>
                      <div className="flex gap-1 bg-muted p-0.5 rounded-md">
                        <button
                          onClick={() => setSplitMode("move")}
                          disabled={activeTab === "commits"}
                          className={cn(
                            "px-2.5 py-1 text-xs font-medium rounded transition-colors",
                            splitMode === "move"
                              ? "bg-background text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          Move
                        </button>
                        <button
                          onClick={() => setSplitMode("copy")}
                          disabled={activeTab === "commits"}
                          className={cn(
                            "px-2.5 py-1 text-xs font-medium rounded transition-colors",
                            splitMode === "copy"
                              ? "bg-background text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground",
                            activeTab === "commits" && "opacity-50 cursor-not-allowed"
                          )}
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Position toggle — disabled when stacking on root */}
                  <div className="flex items-center gap-2">
                    <Label className="text-sm whitespace-nowrap">Position:</Label>
                    <div className={cn(
                      "flex gap-1 bg-muted p-0.5 rounded-md",
                      isStackOnRoot && "opacity-50"
                    )}>
                      <button
                        onClick={() => setPosition("before")}
                        disabled={isStackOnRoot}
                        className={cn(
                          "px-2.5 py-1 text-xs font-medium rounded transition-colors",
                          position === "before"
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground",
                          isStackOnRoot && "cursor-not-allowed"
                        )}
                      >
                        Before
                      </button>
                      <button
                        onClick={() => setPosition("after")}
                        disabled={isStackOnRoot}
                        className={cn(
                          "px-2.5 py-1 text-xs font-medium rounded transition-colors",
                          position === "after"
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground",
                          isStackOnRoot && "cursor-not-allowed"
                        )}
                      >
                        After
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Tree preview (stack and split modes) */}
              {(mode.type === "stack" || mode.type === "split") && treePreview.length > 0 && (
                <div className="bg-muted/50 rounded-md p-3 text-xs font-mono">
                  {treePreview.map((line, i) => (
                    <div
                      key={i}
                      className={cn(
                        "leading-5",
                        line.isNew && "text-green-500 font-semibold",
                        line.isCurrent && "text-foreground font-semibold",
                        !line.isNew && !line.isCurrent && "text-muted-foreground"
                      )}
                      style={{ paddingLeft: `${line.depth * 16}px` }}
                    >
                      {line.depth > 0 && (
                        <span className="text-muted-foreground">{"\u2514\u2500 "}</span>
                      )}
                      {line.label}
                      {line.isCurrent && (
                        <span className="text-muted-foreground font-normal"> (current)</span>
                      )}
                      {line.isNew && (
                        <span className="text-green-500/70 font-normal"> (new)</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* File/Commit tabs (split only) */}
              {mode.type === "split" && (
                <Tabs
                  value={activeTab}
                  onValueChange={(v) => setActiveTab(v as "files" | "commits")}
                >
                  <TabsList className="text-xs">
                    <TabsTrigger value="files" className="text-xs">
                      Files ({changedFiles.length})
                    </TabsTrigger>
                    <TabsTrigger value="commits" className="text-xs">
                      Commits ({commitsAhead.length})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="files" className="mt-2">
                    <div className="max-h-[200px] overflow-y-auto border rounded-md">
                      {changedFiles.length === 0 ? (
                        <div className="p-4 text-sm text-muted-foreground text-center">
                          No changed files in this workspace
                        </div>
                      ) : (
                        changedFiles.map((file) => (
                          <label
                            key={file.path}
                            className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50 cursor-pointer border-b last:border-b-0"
                          >
                            <input
                              type="checkbox"
                              checked={selectedFiles.has(file.path)}
                              onChange={() => toggleFile(file.path)}
                              className="rounded"
                            />
                            <span className={cn("text-xs font-mono w-4 text-center", statusColor(file.status))}>
                              {statusIcon(file.status)}
                            </span>
                            <span className="text-sm truncate">{file.path}</span>
                          </label>
                        ))
                      )}
                    </div>
                    {changedFiles.length > 0 && (
                      <div className="flex gap-2 mt-1.5">
                        <button
                          onClick={() => setSelectedFiles(new Set(changedFiles.map((f) => f.path)))}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Select all
                        </button>
                        <button
                          onClick={() => setSelectedFiles(new Set())}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="commits" className="mt-2">
                    <div className="max-h-[200px] overflow-y-auto border rounded-md">
                      {commitsAhead.length === 0 ? (
                        <div className="p-4 text-sm text-muted-foreground text-center">
                          No commits ahead of target
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
                              className="rounded"
                            />
                            <span className="text-xs font-mono text-muted-foreground">
                              {commit.hash.slice(0, 8)}
                            </span>
                            <span className="text-sm truncate flex-1">
                              {commit.message || "(no description)"}
                            </span>
                          </label>
                        ))
                      )}
                    </div>
                    {commitsAhead.length > 0 && (
                      <div className="flex gap-2 mt-1.5">
                        <button
                          onClick={() => setSelectedCommits(new Set(commitsAhead.map((c) => c.hash)))}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Select all
                        </button>
                        <button
                          onClick={() => setSelectedCommits(new Set())}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                    {activeTab === "commits" && (
                      <p className="text-xs text-muted-foreground mt-1.5">
                        Copy mode is not available for commits
                      </p>
                    )}
                  </TabsContent>
                </Tabs>
              )}

              {/* File selection (createFromHome: optional files to move to new workspace) */}
              {mode.type === "createFromHome" && (
                <div className="grid gap-2">
                  <Label>Active file changes (optional)</Label>
                  <p className="text-sm text-muted-foreground">
                    Select file changes to move into the new workspace. Leave empty to create a workspace from the current branch only.
                  </p>
                  <div className="max-h-[200px] overflow-y-auto border rounded-md">
                    {changedFiles.length === 0 ? (
                      <div className="p-4 text-sm text-muted-foreground text-center">
                        No changed files in working copy
                      </div>
                    ) : (
                      changedFiles.map((file) => (
                        <label
                          key={file.path}
                          className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50 cursor-pointer border-b last:border-b-0"
                        >
                          <input
                            type="checkbox"
                            checked={selectedFiles.has(file.path)}
                            onChange={() => toggleFile(file.path)}
                            className="rounded"
                          />
                          <span className={cn("text-xs font-mono w-4 text-center", statusColor(file.status))}>
                            {statusIcon(file.status)}
                          </span>
                          <span className="text-sm truncate">{file.path}</span>
                        </label>
                      ))
                    )}
                  </div>
                  {changedFiles.length > 0 && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedFiles(new Set(changedFiles.map((f) => f.path)))}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedFiles(new Set())}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Intent */}
              <div className="grid gap-2">
                <Label htmlFor="intent">Intent / Description {mode.type === "create" ? "(optional)" : "(optional)"}</Label>
                <Textarea
                  id="intent"
                  value={intent}
                  onChange={(e) => setIntent(e.target.value)}
                  placeholder={
                    mode.type === "split"
                      ? "What will this new workspace focus on?"
                      : mode.type === "createFromHome"
                      ? "What will this workspace focus on?"
                      : "e.g., Add dark mode to settings"
                  }
                  rows={mode.type === "create" ? 3 : 2}
                  className="resize-none"
                  autoFocus={mode.type === "create"}
                  tabIndex={1}
                />
                {mode.type === "create" && (
                  <p className="text-sm text-muted-foreground">
                    Describe what you plan to implement in this workspace (optional).
                    If provided, the branch name will be auto-generated.
                  </p>
                )}
              </div>

              {/* Branch Name */}
              <div className="grid gap-2">
                <Label htmlFor="branch">Branch Name</Label>
                <div className="relative">
                  <Input
                    id="branch"
                    value={branchName}
                    onChange={(e) => {
                      setBranchName(e.target.value);
                      setIsEditingBranch(true);
                    }}
                    placeholder={
                      mode.type === "split"
                        ? `${mode.type === "split" ? mode.workspace.branch_name : ""}-split-1`
                        : mode.type === "createFromHome"
                        ? `${mode.currentBranch || "main"}-ws-1`
                        : branchPattern.replace("{name}", "example")
                    }
                    className={branchStatus ? "pr-10" : ""}
                    tabIndex={1}
                  />
                  {branchStatus && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {branchStatus === "checking" && (
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      )}
                      {branchStatus === "new" && (
                        <Check className="w-4 h-4 text-green-500" />
                      )}
                      {branchStatus === "local" && (
                        <AlertCircle className="w-4 h-4 text-yellow-500" />
                      )}
                      {branchStatus === "remote" && (
                        <Cloud className="w-4 h-4 text-blue-500" />
                      )}
                    </div>
                  )}
                </div>
                {mode.type === "create" && (
                  <p className="text-sm text-muted-foreground">
                    Pattern: {branchPattern} (configure in Repository Settings)
                  </p>
                )}
                {branchStatus === "local" && (
                  <p className="text-xs text-yellow-600 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {mode.type === "create"
                      ? "A local branch with this name exists. Creating this workspace will checkout the existing branch."
                      : "A local branch with this name already exists"}
                  </p>
                )}
                {branchStatus === "remote" && mode.type === "create" && (
                  <p className="text-sm text-blue-600 flex items-center gap-2">
                    <Cloud className="w-3 h-3" />A remote branch with this name
                    exists. This will be fetched and used as the base.
                  </p>
                )}
              </div>

              {error && <div className="text-sm text-destructive">{error}</div>}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading} tabIndex={3}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} tabIndex={2} variant="default" className="gap-2">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode.type === "create" && !loading && <GitBranchPlusIcon />}
            {submitLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
