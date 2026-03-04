import { useState, useEffect, useRef, useCallback } from "react";
import { Loader2, Check, AlertCircle, Cloud } from "lucide-react";
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
// Branch name is auto-generated with -split-{N} suffix, no pattern needed
import {
  splitWorkspace,
  checkBranchExists,
  getWorkspaceStatus,
  jjGetChangedFiles,
  getWorkspaces,
  type Workspace,
  type WorkspaceStatus,
  type WorkspaceNode,
  type JjFileChange,
  type BranchStatus,
} from "../lib/api";
import { cn, getFullWorkspacePath } from "../lib/utils";

interface SplitWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: Workspace;
  repoPath: string;
  onSplit: (newWorkspaceId: number) => void;
}

export const SplitWorkspaceDialog: React.FC<SplitWorkspaceDialogProps> = ({
  open,
  onOpenChange,
  workspace,
  repoPath,
  onSplit,
}) => {
  // Fetched data
  const [workspaceStatus, setWorkspaceStatus] =
    useState<WorkspaceStatus | null>(null);
  const [changedFiles, setChangedFiles] = useState<JjFileChange[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  // Selection state
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [selectedCommits, setSelectedCommits] = useState<Set<string>>(
    new Set()
  );

  // Options
  const [mode, setMode] = useState<"move" | "copy">("move");
  const [position, setPosition] = useState<"before" | "after">("after");
  const [activeTab, setActiveTab] = useState<"files" | "commits">("files");

  // Form
  const [branchName, setBranchName] = useState("");
  const [intent, setIntent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Branch validation
  const [branchStatusData, setBranchStatusData] =
    useState<BranchStatus | null>(null);
  const [isCheckingBranch, setIsCheckingBranch] = useState(false);
  const checkBranchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { addToast } = useToast();

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

  // Reset form and fetch data when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedFiles(new Set());
      setSelectedCommits(new Set());
      setMode("move");
      setPosition("after");
      setActiveTab("files");
      setError("");
      setBranchStatusData(null);

      // Auto-generate intent from source workspace's intent
      let sourceIntent: string | null = null;
      try {
        if (workspace.metadata) {
          const meta = JSON.parse(workspace.metadata);
          sourceIntent = meta.intent || null;
        }
      } catch { /* ignore */ }
      setIntent(sourceIntent ? `Split from: ${sourceIntent}` : "");

      // Fetch workspace status, changed files, and existing workspaces for unique naming
      const fullPath = getFullWorkspacePath(workspace);
      setDataLoading(true);
      Promise.all([
        getWorkspaceStatus(repoPath, workspace.id),
        jjGetChangedFiles(fullPath),
        getWorkspaces(repoPath),
      ])
        .then(([status, files, allWorkspaces]) => {
          setWorkspaceStatus(status);
          setChangedFiles(files);

          // Auto-generate branch name with -split-{N} suffix
          const existingBranches = new Set(allWorkspaces.map((w) => w.branch_name));
          let index = 1;
          let candidate = `${workspace.branch_name}-split-${index}`;
          while (existingBranches.has(candidate)) {
            index++;
            candidate = `${workspace.branch_name}-split-${index}`;
          }
          setBranchName(candidate);
        })
        .catch((err) => {
          console.error("Failed to load workspace data for split:", err);
          setWorkspaceStatus(null);
          setChangedFiles([]);
          // Fallback branch name
          setBranchName(`${workspace.branch_name}-split-1`);
        })
        .finally(() => {
          setDataLoading(false);
        });
    }
  }, [open, workspace, repoPath]);

  // Note: Branch name is auto-generated on open with -split-{N} suffix.
  // We do NOT override it from intent changes — the user can manually edit if needed.

  // Debounced branch check
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

  // When switching to commits tab, force move mode (no copy for commits)
  useEffect(() => {
    if (activeTab === "commits") {
      setMode("move");
    }
  }, [activeTab]);

  const toggleFile = useCallback((path: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const toggleCommit = useCallback((changeId: string) => {
    setSelectedCommits((prev) => {
      const next = new Set(prev);
      if (next.has(changeId)) {
        next.delete(changeId);
      } else {
        next.add(changeId);
      }
      return next;
    });
  }, []);

  const hasSelection =
    activeTab === "files" ? selectedFiles.size > 0 : selectedCommits.size > 0;

  const canSubmit = hasSelection && branchName.trim() && !loading;

  const handleSplit = async () => {
    if (!canSubmit) return;

    setLoading(true);
    setError("");

    try {
      const newWorkspaceId = await splitWorkspace(
        repoPath,
        workspace.id,
        branchName,
        intent.trim() || null,
        activeTab === "files" ? Array.from(selectedFiles) : null,
        activeTab === "commits" ? Array.from(selectedCommits) : null,
        mode,
        position
      );

      addToast({
        title: "Workspace split successfully",
        description: `Created new workspace ${branchName}`,
        type: "success",
      });

      onSplit(newWorkspaceId);
      onOpenChange(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      addToast({
        title: "Failed to split workspace",
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
      handleSplit();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onOpenChange(false);
    }
  };

  // Build tree preview
  const treePreview = buildTreePreview(
    workspaceStatus?.dag_nodes ?? [],
    workspace,
    position,
    branchName || "[New Workspace]"
  );

  const statusIcon = (status: string) => {
    switch (status) {
      case "modified":
        return "M";
      case "added":
        return "A";
      case "deleted":
        return "D";
      case "renamed":
        return "R";
      default:
        return "?";
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "modified":
        return "text-yellow-500";
      case "added":
        return "text-green-500";
      case "deleted":
        return "text-red-500";
      case "renamed":
        return "text-blue-500";
      default:
        return "text-muted-foreground";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>Split Workspace</DialogTitle>
          <DialogDescription>
            Move or copy files/commits to a new workspace
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {dataLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">
                Loading workspace data...
              </span>
            </div>
          )}

          {!dataLoading && <>
          {/* Mode and Position controls */}
          <div className="flex items-center gap-4">
            {/* Mode toggle */}
            <div className="flex items-center gap-2">
              <Label className="text-sm whitespace-nowrap">Mode:</Label>
              <div className="flex gap-1 bg-muted p-0.5 rounded-md">
                <button
                  onClick={() => setMode("move")}
                  disabled={activeTab === "commits"}
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium rounded transition-colors",
                    mode === "move"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Move
                </button>
                <button
                  onClick={() => setMode("copy")}
                  disabled={activeTab === "commits"}
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium rounded transition-colors",
                    mode === "copy"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                    activeTab === "commits" && "opacity-50 cursor-not-allowed"
                  )}
                >
                  Copy
                </button>
              </div>
            </div>

            {/* Position toggle */}
            <div className="flex items-center gap-2">
              <Label className="text-sm whitespace-nowrap">Position:</Label>
              <div className="flex gap-1 bg-muted p-0.5 rounded-md">
                <button
                  onClick={() => setPosition("before")}
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium rounded transition-colors",
                    position === "before"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Before
                </button>
                <button
                  onClick={() => setPosition("after")}
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium rounded transition-colors",
                    position === "after"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  After
                </button>
              </div>
            </div>
          </div>

          {/* Tree preview */}
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

          {/* File/Commit tabs */}
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
                      <span
                        className={cn(
                          "text-xs font-mono w-4 text-center",
                          statusColor(file.status)
                        )}
                      >
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
                    onClick={() =>
                      setSelectedFiles(
                        new Set(changedFiles.map((f) => f.path))
                      )
                    }
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
                    onClick={() =>
                      setSelectedCommits(
                        new Set(commitsAhead.map((c) => c.hash))
                      )
                    }
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

          {/* Branch name */}
          <div className="grid gap-2">
            <Label htmlFor="split-branch">Branch Name</Label>
            <div className="relative">
              <Input
                id="split-branch"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                placeholder={`${workspace.branch_name}-split-1`}
                className={branchStatus ? "pr-10" : ""}
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
            {branchStatus === "local" && (
              <p className="text-xs text-yellow-600 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />A local branch with this
                name already exists
              </p>
            )}
          </div>

          {/* Intent */}
          <div className="grid gap-2">
            <Label htmlFor="split-intent">Intent (optional)</Label>
            <Textarea
              id="split-intent"
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              placeholder="What will this new workspace focus on?"
              rows={2}
              className="resize-none"
            />
          </div>

          {error && <div className="text-sm text-destructive">{error}</div>}
          </>}
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button onClick={handleSplit} disabled={!canSubmit} variant="ghost">
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                Splitting...
              </>
            ) : (
              `Split ${selectedFiles.size + selectedCommits.size} item${selectedFiles.size + selectedCommits.size !== 1 ? "s" : ""}`
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Tree preview helpers

interface TreeLine {
  depth: number;
  label: string;
  isCurrent: boolean;
  isNew: boolean;
}

function buildTreePreview(
  dagNodes: WorkspaceNode[],
  currentWorkspace: Workspace,
  position: "before" | "after",
  newLabel: string
): TreeLine[] {
  const lines: TreeLine[] = [];

  // Find the root target (main or first node)
  const rootTarget =
    currentWorkspace.target_branch ??
    dagNodes.find((n) => n.depth === 0)?.status.current.branch_name ??
    "main";

  // Find root node (depth 0) or use target branch as virtual root
  const rootNode = [...dagNodes]
    .sort((a, b) => a.depth - b.depth)
    .find((n) => n.depth === 0);
  const rootLabel = rootNode?.status.current.branch_name ?? rootTarget;
  const currentIsRoot = rootLabel === currentWorkspace.branch_name;

  // Determine the depth of current workspace in the DAG
  const currentNode = dagNodes.find(
    (n) => n.status.current.id === currentWorkspace.id
  );
  const currentDepth = currentIsRoot ? 0 : (currentNode?.depth ?? 1);

  // Children of current workspace
  const children = dagNodes.filter(
    (n) =>
      n.parent_id === currentWorkspace.id &&
      n.status.current.id !== currentWorkspace.id
  );

  if (position === "before") {
    // root -> ... -> [new] -> current -> children
    lines.push({
      depth: 0,
      label: rootLabel,
      isCurrent: currentIsRoot ? false : false,
      isNew: false,
    });

    // If current is not root, show intermediate path as "..."
    if (!currentIsRoot && currentDepth > 1) {
      lines.push({
        depth: 1,
        label: "...",
        isCurrent: false,
        isNew: false,
      });
    }

    // New workspace inserted before current
    const newDepth = currentIsRoot ? 1 : currentDepth;
    lines.push({
      depth: newDepth,
      label: newLabel,
      isCurrent: false,
      isNew: true,
    });

    // Current workspace pushed one level deeper
    lines.push({
      depth: newDepth + 1,
      label: currentWorkspace.branch_name,
      isCurrent: true,
      isNew: false,
    });

    for (const child of children) {
      lines.push({
        depth: newDepth + 2,
        label: child.status.current.branch_name,
        isCurrent: false,
        isNew: false,
      });
    }
  } else {
    // root -> ... -> current -> [new] + children
    lines.push({
      depth: 0,
      label: rootLabel,
      isCurrent: currentIsRoot,
      isNew: false,
    });

    if (!currentIsRoot) {
      if (currentDepth > 1) {
        lines.push({
          depth: 1,
          label: "...",
          isCurrent: false,
          isNew: false,
        });
      }
      lines.push({
        depth: currentDepth,
        label: currentWorkspace.branch_name,
        isCurrent: true,
        isNew: false,
      });
    }

    // New workspace as child of current
    lines.push({
      depth: currentDepth + 1,
      label: newLabel,
      isCurrent: false,
      isNew: true,
    });

    for (const child of children) {
      lines.push({
        depth: currentDepth + 1,
        label: child.status.current.branch_name,
        isCurrent: false,
        isNew: false,
      });
    }
  }

  return lines;
}
