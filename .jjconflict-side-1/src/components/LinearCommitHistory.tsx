import { memo, useEffect, useState } from "react";
import { jjGetLog, type JjLogCommit } from "../lib/api";
import { cn } from "../lib/utils";

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
          const filtered = commits.filter( ({is_working_copy}) => !is_working_copy)
          setCommits(filtered);
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

    if (commits.length === 0) {
      return <EmptyState />;
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
                  isFirst={index === 0}
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
  isFirst: boolean;
  isLast: boolean;
}

function CommitItem({ commit, isFirst }: CommitItemProps) {
  const firstLine = commit.description.split("\n")[0] || "(no message)";

  const isHead = isFirst;

  return (
    <li className="relative flex items-start gap-3 py-2">
      <div className="relative z-10 flex-shrink-0">
        <div
          className={cn(
            "w-[14px] h-[14px] rounded-full border-2 border-background",
            isHead ? "bg-primary" : "bg-muted-foreground"
          )}
        />
      </div>

      <div className="flex-1 min-w-0 pt-0.5">
        <p className="text-sm truncate" title={firstLine}>
          {firstLine}
        </p>
        <p className="text-xs text-muted-foreground font-mono mt-0.5">
          {commit.short_id}
        </p>
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

function EmptyState() {
  return (
    <div className="h-full flex items-center justify-center p-4">
      <p className="text-sm text-muted-foreground">No commits</p>
    </div>
  );
}
