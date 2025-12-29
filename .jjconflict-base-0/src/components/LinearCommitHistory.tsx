import { memo, useEffect, useState } from "react";
import { jjGetLog, type JjLogCommit } from "../lib/api";
import { cn, formatRelativeTime, formatFullTimestamp } from "../lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";

interface LinearCommitHistoryProps {
  workspacePath: string;
  targetBranch: string | null;
}

export const LinearCommitHistory = memo<LinearCommitHistoryProps>(
  function LinearCommitHistory({ workspacePath, targetBranch }) {
    const [commits, setCommits] = useState<JjLogCommit[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      if (!workspacePath || !targetBranch) {
        setLoading(false);
        return;
      }
      setLoading(true);
      jjGetLog(workspacePath, targetBranch)
        .then(({commits}) => {
          // Filter out working copy commits
          const filtered = commits.filter(({is_working_copy}) => !is_working_copy);
          // Reverse to show oldest first, newest at bottom
          setCommits(filtered.reverse());
        })
        .catch((err) => {
          console.error('Failed to fetch commit history:', err);
          setCommits([]);
        })
        .finally(() => {
          setLoading(false);
        });
    }, [workspacePath, targetBranch]);

    if (loading) {
      return <LoadingState />;
    }

    // Hide entire graph if no commits after filtering
    if (commits.length === 0) {
      return null;
    }

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

            <ul className="space-y-0">
              {commits.map((commit, index) => (
                <CommitItem
                  key={commit.commit_id}
                  commit={commit}
                  isLast={index === commits.length - 1}
                />
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  }
);

interface CommitItemProps {
  commit: JjLogCommit;
  isLast: boolean;
}

function CommitItem({ commit, isLast }: CommitItemProps) {
  const firstLine = commit.description.split("\n")[0] || "(no message)";
  const hasStats = commit.insertions > 0 || commit.deletions > 0;

  return (
    <li className="relative flex items-start gap-3 py-2">
      <div className="relative z-10 flex-shrink-0">
        <div
          className={cn(
            "w-[14px] h-[14px] rounded-full border-2 border-background",
            isLast ? "bg-primary" : "bg-muted-foreground"
          )}
        />
      </div>

      <div
        className={cn(
          "flex-1 min-w-0 pt-0.5 rounded-md",
          isLast && "bg-accent/50 p-2 -m-2 shadow-sm border border-accent"
        )}
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
            <span className="text-xs text-muted-foreground">
              <span className="text-green-600">+{commit.insertions}</span>
              {" "}
              <span className="text-red-600">-{commit.deletions}</span>
            </span>
          )}
        </div>
      </div>
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
