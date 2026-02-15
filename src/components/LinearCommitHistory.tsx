import { memo, useEffect, useMemo, useState } from "react";
import { jjGetLog, type JjLogCommit } from "../lib/api";
import { cn, formatRelativeTime, formatFullTimestamp, getDayKey, formatDayLabel } from "../lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";

interface LinearCommitHistoryProps {
  workspacePath: string;
  targetBranch: string | null;
  isHomeRepo?: boolean;
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
  function LinearCommitHistory({ workspacePath, targetBranch, isHomeRepo }) {
    const [commits, setCommits] = useState<JjLogCommit[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      if (!workspacePath || !targetBranch) {
        setLoading(false);
        return;
      }
      setLoading(true);
      jjGetLog(workspacePath, targetBranch, isHomeRepo)
        .then(({commits}) => {
          // Skip the first commit (working copy / uncommitted @)
          setCommits(commits.slice(1));
        })
        .catch((err) => {
          console.error('Failed to fetch commit history:', err);
          setCommits([]);
        })
        .finally(() => {
          setLoading(false);
        });
    }, [workspacePath, targetBranch, isHomeRepo]);

    const dayGroups = useMemo(() => groupCommitsByDay(commits), [commits]);

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
                      />
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
);

interface CommitItemProps {
  commit: JjLogCommit;
  isFirst: boolean;
}

function CommitItem({ commit, isFirst }: CommitItemProps) {
  const firstLine = commit.description.split("\n")[0] || "(no message)";
  const hasStats = commit.insertions > 0 || commit.deletions > 0;

  return (
    <li className="relative flex items-start gap-3 py-2">
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
          isFirst && "bg-accent/50 p-2 -m-2 shadow-sm border border-accent"
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
