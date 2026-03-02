import { memo, useEffect, useMemo, useState } from "react";
import { abandonCommit, listCommits, type JjLogCommit } from "../lib/api";
import { cn, formatRelativeTime, formatFullTimestamp, getDayKey, formatDayLabel } from "../lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { ArrowRightLeft, Trash2 } from "lucide-react";
import { MoveCommitToNewWorkspaceDialog } from "./MoveCommitToNewWorkspaceDialog";
import { MoveCommitToExistingWorkspaceDialog } from "./MoveCommitToExistingWorkspaceDialog";
import { useToast } from "./ui/toast";

const REMOVE_ANIMATION_MS = 220;

interface LinearCommitHistoryProps {
  repoPath: string;
  workspaceId: number | null;
  // Optional props for move-commit feature
  onCommitMoved?: () => void;
  onCommitClick?: (changeId: string) => void;
}

interface DayGroup {
  dayKey: string;
  label: string;
  commits: JjLogCommit[];
}

function groupCommitsByDay(commits: JjLogCommit[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const commit of commits) {
    const key = getDayKey(commit.timestamp);
    const last = groups[groups.length - 1];
    if (last && last.dayKey === key) {
      last.commits.push(commit);
    } else {
      groups.push({
        dayKey: key,
        label: formatDayLabel(commit.timestamp),
        commits: [commit],
      });
    }
  }
  return groups;
}

export const LinearCommitHistory = memo<LinearCommitHistoryProps>(
  function LinearCommitHistory({ repoPath, workspaceId, onCommitMoved, onCommitClick }) {
    const [commits, setCommits] = useState<JjLogCommit[]>([]);
    const [loading, setLoading] = useState(true);
    const [moveTarget, setMoveTarget] = useState<JjLogCommit | null>(null);
    const [showNewDialog, setShowNewDialog] = useState(false);
    const [showExistingDialog, setShowExistingDialog] = useState(false);
    const [removingCommitIds, setRemovingCommitIds] = useState<Set<string>>(new Set());
    const { addToast } = useToast();

    useEffect(() => {
      if (!repoPath) {
        setLoading(false);
        return;
      }
      setLoading(true);
      listCommits(repoPath, workspaceId)
        .then((result) => {
          // Skip the first commit (working copy / uncommitted @)
          const nextCommits = result?.commits ?? [];
          setCommits(nextCommits.slice(1));
          setRemovingCommitIds(new Set());
        })
        .catch((err) => {
          console.error('Failed to fetch commit history:', err);
          setCommits([]);
        })
        .finally(() => {
          setLoading(false);
        });
    }, [repoPath, workspaceId]);

    const dayGroups = useMemo(() => groupCommitsByDay(commits), [commits]);

    const canMove = !!(workspaceId !== null && workspaceId !== undefined && repoPath);

    const handleMoveToNew = (commit: JjLogCommit) => {
      setMoveTarget(commit);
      setShowNewDialog(true);
    };

    const handleMoveToExisting = (commit: JjLogCommit) => {
      setMoveTarget(commit);
      setShowExistingDialog(true);
    };

    const handleAbandon = async (commit: JjLogCommit) => {
      if (!repoPath || !workspaceId) {
        return;
      }

      const firstLine = commit.description.split("\n")[0] || "(no message)";
      const confirmed = window.confirm(`Abandon this commit?\n\n${commit.short_id} — ${firstLine}`);
      if (!confirmed) {
        return;
      }

      try {
        await abandonCommit(repoPath, workspaceId, commit.change_id);
        setRemovingCommitIds((prev) => new Set(prev).add(commit.commit_id));

        window.setTimeout(() => {
          setCommits((prev) => prev.filter((c) => c.commit_id !== commit.commit_id));
          setRemovingCommitIds((prev) => {
            const next = new Set(prev);
            next.delete(commit.commit_id);
            return next;
          });
          onCommitMoved?.();
        }, REMOVE_ANIMATION_MS);

        addToast({
          title: "Commit deleted",
          description: `Abandoned commit ${commit.short_id}`,
          type: "success",
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        addToast({
          title: "Failed to delete commit",
          description: errorMsg,
          type: "error",
        });
      }
    };

    if (loading) {
      return <LoadingState />;
    }

    if (commits.length === 0) {
      return (
        <div className="p-4">
          <h3 className="text-sm font-semibold text-muted-foreground mb-4">
            Commits
          </h3>
          <p className="text-sm text-muted-foreground text-center">
            No commits yet.
          </p>
          <p className="text-sm text-muted-foreground text-center">
            Changes you commit will appear here.
          </p>
        </div>
      );
    }

    let globalIndex = 0;

    return (
      <div className="h-full overflow-auto">
        <div className="p-4">
          <h3 className="text-sm font-semibold text-muted-foreground mb-4">
            Commits
          </h3>
          <div className="relative">
            <div
              className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-border"
              aria-hidden="true"
            />

            {dayGroups.map((group) => (
              <div key={group.dayKey} className="mt-5 first:mt-0">
                <p className="text-xs font-semibold text-muted-foreground mb-1 pl-7">
                  {group.label}
                </p>
                <ul className="space-y-0">
                  {group.commits.map((commit) => {
                    const isFirst = globalIndex === 0;
                    globalIndex++;
                    return (
                      <CommitItem
                        key={commit.commit_id}
                        commit={commit}
                        isFirst={isFirst}
                        canMove={canMove}
                        isRemoving={removingCommitIds.has(commit.commit_id)}
                        onMoveToNew={handleMoveToNew}
                        onMoveToExisting={handleMoveToExisting}
                        onAbandon={handleAbandon}
                        onCommitClick={onCommitClick}
                      />
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Move commit dialogs */}
        {canMove && moveTarget && (
          <>
            <MoveCommitToNewWorkspaceDialog
              open={showNewDialog}
              onOpenChange={setShowNewDialog}
              commit={moveTarget}
              repoPath={repoPath!}
              sourceWorkspaceId={workspaceId!}
              onSuccess={() => {
                onCommitMoved?.();
              }}
            />
            <MoveCommitToExistingWorkspaceDialog
              open={showExistingDialog}
              onOpenChange={setShowExistingDialog}
              commit={moveTarget}
              repoPath={repoPath!}
              sourceWorkspaceId={workspaceId!}
              onSuccess={() => {
                onCommitMoved?.();
              }}
            />
          </>
        )}
      </div>
    );
  }
);

interface CommitItemProps {
  commit: JjLogCommit;
  isFirst: boolean;
  canMove: boolean;
  isRemoving: boolean;
  onMoveToNew: (commit: JjLogCommit) => void;
  onMoveToExisting: (commit: JjLogCommit) => void;
  onAbandon: (commit: JjLogCommit) => void;
  onCommitClick?: (changeId: string) => void;
}

function CommitItem({ commit, isFirst, canMove, isRemoving, onMoveToNew, onMoveToExisting, onAbandon, onCommitClick }: CommitItemProps) {
  const firstLine = commit.description.split("\n")[0] || "(no message)";
  const hasStats = commit.insertions > 0 || commit.deletions > 0;

  return (
    <li
      className={cn(
        "relative flex items-start gap-3 py-2 px-2 -mx-2 rounded-md group transition-all duration-200 hover:bg-muted",
        isRemoving && "opacity-0 -translate-x-1 max-h-0 py-0 overflow-hidden"
      )}
    >
      <div className="relative z-10 flex-shrink-0">
        <div
          className={cn(
            "w-[14px] h-[14px] rounded-full border-2 border-background",
            isFirst ? "bg-primary" : "bg-muted-foreground"
          )}
        />
      </div>

      <div
        className={cn(
          "flex-1 min-w-0 pt-0.5 rounded-md",
          isFirst && "bg-accent/50 p-2 -m-2 shadow-sm border border-accent",
          onCommitClick && "cursor-pointer hover:bg-muted/40 transition-colors"
        )}
        onClick={onCommitClick ? () => onCommitClick(commit.change_id) : undefined}
      >
        <p className="text-sm truncate" title={firstLine}>
          {firstLine}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <p className="text-xs text-muted-foreground font-mono">
            {commit.short_id}
          </p>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-xs text-muted-foreground">
                  {formatRelativeTime(commit.timestamp)}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>{formatFullTimestamp(commit.timestamp)}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {hasStats && (
            <span className="text-xs text-muted-foreground ml-auto">
              <span className="text-green-600">+{commit.insertions}</span>
              {" "}
              <span className="text-red-600">-{commit.deletions}</span>
            </span>
          )}
        </div>
      </div>

      {canMove && (
        <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                title="Move commit"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onMoveToNew(commit)}>
                Move to New Workspace
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onMoveToExisting(commit)}>
                Move to Existing Workspace
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-destructive"
            title="Delete commit"
            onClick={() => onAbandon(commit)}
            disabled={isRemoving}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </li>
  );
}

function LoadingState() {
  return (
    <div className="h-full flex items-center justify-center p-4">
      <p className="text-sm text-muted-foreground">Loading commits...</p>
    </div>
  );
}
