import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Copy,
  Loader2,
  MoreVertical,
  Trash2,
  Upload,
} from "lucide-react";
import {
  applyStash,
  deleteStash,
  exportStashGitPatch,
  getStashDiff,
  listStashes,
  type JjRevisionDiff,
  type StashEntry,
  type Workspace,
} from "../lib/api";
import { cn } from "../lib/utils";
import {
  getLinePrefix,
  getLineTypeClass,
} from "./changes-diff-viewer/utils";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { useToast } from "./ui/toast";

/** Target branch value that applies onto the home repo working copy. */
export const HOME_STASH_APPLY_TARGET = ".";

interface StashModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoPath: string;
  workspaces: Workspace[];
  /** Called after a stash is applied so the caller can refresh diffs. */
  onApplied?: () => void;
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function StashDiffPane({ diff }: { diff: JjRevisionDiff }) {
  if (diff.too_large_to_render) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        {diff.render_block_reason ?? "Diff is too large to render."}
      </p>
    );
  }

  if (diff.hunks_by_file.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No file changes in this stash.
      </p>
    );
  }

  return (
    <div className="space-y-4" data-testid="stash-diff-pane">
      {diff.hunks_by_file.map((file) => (
        <div key={file.path} data-testid="stash-diff-file">
          <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border px-2 py-1.5 text-xs font-mono font-medium">
            {file.path}
          </div>
          <div className="font-mono text-xs overflow-x-auto">
            {file.hunks.map((hunk) => (
              <div key={hunk.id} className="mb-2">
                <div className="px-2 py-0.5 text-muted-foreground bg-muted/40">
                  {hunk.header}
                </div>
                {hunk.lines.map((line, idx) => (
                  <div
                    key={`${hunk.id}-${idx}`}
                    className={cn(
                      "px-2 whitespace-pre",
                      getLineTypeClass(line),
                    )}
                  >
                    <span className="select-none text-muted-foreground mr-1">
                      {getLinePrefix(line)}
                    </span>
                    {line.startsWith("+") || line.startsWith("-")
                      ? line.slice(1)
                      : line.startsWith(" ")
                        ? line.slice(1)
                        : line}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export const StashModal: React.FC<StashModalProps> = ({
  open,
  onOpenChange,
  repoPath,
  workspaces,
  onApplied,
}) => {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const wasOpenRef = useRef(false);

  const {
    data: entries = [],
    isPending,
    refetch,
  } = useQuery({
    queryKey: ["stashes", repoPath],
    enabled: open && Boolean(repoPath),
    queryFn: () => listStashes(repoPath),
  });

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setSelectedId(null);
    }
    wasOpenRef.current = open;
  }, [open]);

  useEffect(() => {
    if (!open || selectedId !== null || entries.length === 0) return;
    setSelectedId(entries[0].id);
  }, [open, entries, selectedId]);

  const selectedEntry =
    entries.find((entry) => entry.id === selectedId) ?? null;

  const {
    data: selectedDiff,
    isPending: diffPending,
  } = useQuery({
    queryKey: ["stash-diff", repoPath, selectedEntry?.id],
    enabled: open && selectedEntry != null,
    queryFn: () => getStashDiff(repoPath, selectedEntry!.id),
  });

  const applyTargets = useMemo(() => {
    const targets: { branch: string; label: string }[] = [
      { branch: HOME_STASH_APPLY_TARGET, label: "Home repo" },
    ];
    for (const ws of workspaces) {
      targets.push({
        branch: ws.branch_name,
        label: ws.title?.trim() || ws.branch_name,
      });
    }
    return targets;
  }, [workspaces]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["stashes", repoPath] });
    await refetch();
  };

  const handleCopyPatch = async (entry: StashEntry) => {
    setPendingAction(`patch-${entry.id}`);
    try {
      const patch = await exportStashGitPatch(repoPath, entry.id);
      await navigator.clipboard.writeText(patch);
      addToast({
        title: "Copied",
        description: "Git patch copied to clipboard",
        type: "success",
      });
    } catch (error) {
      addToast({
        title: "Failed to copy patch",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
    } finally {
      setPendingAction(null);
    }
  };

  const handleDelete = async (entry: StashEntry) => {
    setPendingAction(`delete-${entry.id}`);
    try {
      await deleteStash(repoPath, entry.id);
      if (selectedId === entry.id) setSelectedId(null);
      await invalidate();
      addToast({
        title: "Stash deleted",
        description: `Removed stash ${entry.short_commit_id}`,
        type: "success",
      });
    } catch (error) {
      addToast({
        title: "Failed to delete stash",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
    } finally {
      setPendingAction(null);
    }
  };

  const handleApply = async (entry: StashEntry, targetBranch: string) => {
    setPendingAction(`apply-${entry.id}`);
    try {
      await applyStash(repoPath, entry.id, targetBranch);
      const label =
        applyTargets.find((t) => t.branch === targetBranch)?.label ??
        targetBranch;
      addToast({
        title: "Stash applied",
        description: `Copied onto ${label}`,
        type: "success",
      });
      onApplied?.();
    } catch (error) {
      addToast({
        title: "Failed to apply stash",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex w-[75vw] max-w-none h-[80vh] flex-col gap-y-4"
        data-testid="stash-modal"
      >
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Archive className="w-4 h-4" />
            Stashed Changes
          </DialogTitle>
        </DialogHeader>

        {isPending && (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Loading stashes...
          </p>
        )}
        {!isPending && entries.length === 0 && (
          <p
            className="text-sm text-muted-foreground py-8 text-center"
            data-testid="stash-empty"
          >
            No stashed changes yet. Stash working-copy changes from the Changes
            panel to save them here.
          </p>
        )}
        {!isPending && entries.length > 0 && (
          <div className="flex-1 min-h-0 flex gap-4 overflow-hidden">
            <div
              className="w-72 flex-shrink-0 overflow-y-auto space-y-1 pr-2 border-r border-border"
              data-testid="stash-list"
            >
              {entries.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  data-testid="stash-list-item"
                  aria-current={entry.id === selectedId}
                  onClick={() => setSelectedId(entry.id)}
                  className={cn(
                    "w-full text-left rounded-md px-2 py-2 text-xs transition-colors",
                    entry.id === selectedId
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50",
                  )}
                >
                  <div className="font-mono font-medium truncate">
                    {entry.workspace_label}
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground mt-0.5">
                    <span className="font-mono">{entry.short_commit_id}</span>
                    <span>{formatTimestamp(entry.created_at)}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-green-600">+{entry.additions}</span>
                    <span className="text-red-600">-{entry.deletions}</span>
                    <span className="text-muted-foreground">
                      {entry.files_changed.length}{" "}
                      {entry.files_changed.length === 1 ? "file" : "files"}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            <div
              className="flex-1 min-w-0 overflow-y-auto"
              data-testid="stash-detail"
            >
              {selectedEntry ? (
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2 sticky top-0 z-20 bg-background pb-2 border-b border-border">
                    <div className="min-w-0 text-xs space-y-1">
                      <div className="font-mono font-medium text-sm truncate">
                        {selectedEntry.workspace_label}
                      </div>
                      <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                        <span className="font-mono">
                          {selectedEntry.short_commit_id}
                        </span>
                        <span>{formatTimestamp(selectedEntry.created_at)}</span>
                        <span>
                          <span className="text-green-600">
                            +{selectedEntry.additions}
                          </span>{" "}
                          <span className="text-red-600">
                            -{selectedEntry.deletions}
                          </span>
                        </span>
                        <span>
                          {selectedEntry.files_changed.length} files
                        </span>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2"
                          disabled={pendingAction !== null}
                          aria-label="More stash actions"
                          data-testid="stash-more-menu"
                        >
                          {pendingAction ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <MoreVertical className="w-3.5 h-3.5" />
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" sideOffset={4}>
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger
                            data-testid="stash-apply-submenu"
                          >
                            <Upload className="w-3.5 h-3.5 mr-2" />
                            Apply to workspace
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent className="max-h-64 overflow-y-auto">
                            {applyTargets.map((target) => (
                              <DropdownMenuItem
                                key={target.branch}
                                data-testid={`stash-apply-${target.branch}`}
                                onSelect={() =>
                                  handleApply(selectedEntry, target.branch)
                                }
                              >
                                {target.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                        <DropdownMenuItem
                          data-testid="stash-copy-patch"
                          onSelect={() => handleCopyPatch(selectedEntry)}
                        >
                          <Copy className="w-3.5 h-3.5 mr-2" />
                          Copy as git patch
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          data-testid="stash-delete"
                          className="text-destructive focus:text-destructive"
                          onSelect={() => handleDelete(selectedEntry)}
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-2" />
                          Delete stash
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {diffPending && (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                      Loading diff...
                    </p>
                  )}
                  {!diffPending && selectedDiff && (
                    <StashDiffPane diff={selectedDiff} />
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Select a stash to view its changes.
                </p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
