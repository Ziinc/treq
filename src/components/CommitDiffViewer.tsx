import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  jjGetLog,
  jjGetCommitDiff,
  type JjLogCommit,
  type JjRevisionDiff,
  type JjDiffHunk,
} from "../lib/api";
import {
  cn,
  formatRelativeTime,
  formatFullTimestamp,
  getDayKey,
  formatDayLabel,
} from "../lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { ChevronRight, FileText, Loader2 } from "lucide-react";

interface CommitDiffViewerProps {
  workspacePath: string;
  repoPath: string;
  workspaceId: number | null;
  targetBranch: string | null;
  isHomeRepo?: boolean;
  scrollToCommitId?: string | null;
  onScrollComplete?: () => void;
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

// Parse hunk header to extract starting line numbers
const parseHunkHeader = (
  header: string
): { oldStart: number; newStart: number } => {
  const match = header.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
  if (!match) return { oldStart: 1, newStart: 1 };
  return {
    oldStart: parseInt(match[1], 10),
    newStart: parseInt(match[2], 10),
  };
};

export const CommitDiffViewer = memo<CommitDiffViewerProps>(
  function CommitDiffViewer({
    workspacePath,
    repoPath,
    workspaceId,
    targetBranch,
    isHomeRepo,
    scrollToCommitId,
    onScrollComplete,
  }) {
    const [commits, setCommits] = useState<JjLogCommit[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedCommits, setExpandedCommits] = useState<Set<string>>(
      new Set()
    );
    const [commitDiffs, setCommitDiffs] = useState<
      Map<string, { diff: JjRevisionDiff; loading: boolean; error?: string }>
    >(new Map());
    const containerRef = useRef<HTMLDivElement>(null);

    // Fetch commits
    useEffect(() => {
      if (!workspacePath || !targetBranch) {
        setLoading(false);
        return;
      }
      setLoading(true);
      jjGetLog(workspacePath, targetBranch, isHomeRepo)
        .then((result) => {
          const nextCommits = result?.commits ?? [];
          setCommits(nextCommits.slice(1)); // Skip working copy
        })
        .catch((err) => {
          console.error("Failed to fetch commit history:", err);
          setCommits([]);
        })
        .finally(() => setLoading(false));
    }, [workspacePath, targetBranch, isHomeRepo]);

    // Scroll to commit when scrollToCommitId changes
    useEffect(() => {
      if (!scrollToCommitId || loading) return;
      // Find the commit by change_id to get its commit_id for the key
      const commit = commits.find((c) => c.change_id === scrollToCommitId);
      if (!commit) return;
      const el = containerRef.current?.querySelector(
        `[data-commit-id="${commit.commit_id}"]`
      );
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        // Auto-expand the commit
        fetchAndExpand(commit.commit_id);
        onScrollComplete?.();
      }
    }, [scrollToCommitId, loading, commits]);

    const fetchAndExpand = useCallback(
      (commitId: string) => {
        setExpandedCommits((prev) => {
          if (prev.has(commitId)) return prev;
          const next = new Set(prev);
          next.add(commitId);
          return next;
        });
        // Fetch diff if not already loaded
        if (!commitDiffs.has(commitId)) {
          setCommitDiffs((prev) => {
            const next = new Map(prev);
            next.set(commitId, { diff: { files: [], hunks_by_file: [] }, loading: true });
            return next;
          });
          jjGetCommitDiff(repoPath, workspaceId, commitId)
            .then((diff) => {
              setCommitDiffs((prev) => {
                const next = new Map(prev);
                next.set(commitId, { diff, loading: false });
                return next;
              });
            })
            .catch((err) => {
              setCommitDiffs((prev) => {
                const next = new Map(prev);
                next.set(commitId, {
                  diff: { files: [], hunks_by_file: [] },
                  loading: false,
                  error: String(err),
                });
                return next;
              });
            });
        }
      },
      [repoPath, workspaceId, commitDiffs]
    );

    const toggleCommit = useCallback(
      (commitId: string) => {
        setExpandedCommits((prev) => {
          const next = new Set(prev);
          if (next.has(commitId)) {
            next.delete(commitId);
          } else {
            next.add(commitId);
            // Fetch diff if not already loaded
            if (!commitDiffs.has(commitId)) {
              setCommitDiffs((prev) => {
                const next = new Map(prev);
                next.set(commitId, { diff: { files: [], hunks_by_file: [] }, loading: true });
                return next;
              });
              jjGetCommitDiff(repoPath, workspaceId, commitId)
                .then((diff) => {
                  setCommitDiffs((prev) => {
                    const next = new Map(prev);
                    next.set(commitId, { diff, loading: false });
                    return next;
                  });
                })
                .catch((err) => {
                  setCommitDiffs((prev) => {
                    const next = new Map(prev);
                    next.set(commitId, {
                      diff: { files: [], hunks_by_file: [] },
                      loading: false,
                      error: String(err),
                    });
                    return next;
                  });
                });
            }
          }
          return next;
        });
      },
      [repoPath, workspaceId, commitDiffs]
    );

    const dayGroups = useMemo(
      () => groupCommitsByDay(commits),
      [commits]
    );

    if (loading) {
      return (
        <div className="h-full flex items-center justify-center p-4">
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          <p className="text-sm text-muted-foreground">Loading commits...</p>
        </div>
      );
    }

    if (commits.length === 0) {
      return (
        <div className="p-4 text-center">
          <p className="text-sm text-muted-foreground">No commits yet.</p>
          <p className="text-sm text-muted-foreground">
            Changes you commit will appear here.
          </p>
        </div>
      );
    }

    let globalIndex = 0;

    return (
      <div ref={containerRef} className="h-full overflow-auto">
        <div className="p-4">
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
                <div className="space-y-0">
                  {group.commits.map((commit) => {
                    const isFirst = globalIndex === 0;
                    globalIndex++;
                    const isExpanded = expandedCommits.has(commit.commit_id);
                    const diffData = commitDiffs.get(commit.commit_id);

                    return (
                      <CommitWithDiff
                        key={commit.commit_id}
                        commit={commit}
                        isFirst={isFirst}
                        isExpanded={isExpanded}
                        diffData={diffData}
                        onToggle={() => toggleCommit(commit.commit_id)}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
);

// --- Sub-components ---

interface CommitWithDiffProps {
  commit: JjLogCommit;
  isFirst: boolean;
  isExpanded: boolean;
  diffData?: {
    diff: JjRevisionDiff;
    loading: boolean;
    error?: string;
  };
  onToggle: () => void;
}

function CommitWithDiff({
  commit,
  isFirst,
  isExpanded,
  diffData,
  onToggle,
}: CommitWithDiffProps) {
  const firstLine = commit.description.split("\n")[0] || "(no message)";
  const hasStats = commit.insertions > 0 || commit.deletions > 0;

  return (
    <div data-commit-id={commit.commit_id}>
      {/* Commit header row */}
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "relative flex items-start gap-3 py-2 px-2 -mx-2 w-full text-left group",
          "hover:bg-muted/50 rounded-md transition-colors cursor-pointer"
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

        <div className="flex-1 min-w-0 pt-0.5">
          <div className="flex items-center gap-1.5">
            <ChevronRight
              className={cn(
                "w-3.5 h-3.5 text-muted-foreground transition-transform flex-shrink-0",
                isExpanded && "rotate-90"
              )}
            />
            <p className="text-sm truncate" title={firstLine}>
              {firstLine}
            </p>
          </div>
          <div className="flex items-center gap-2 mt-0.5 pl-5">
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
                <span className="text-green-600">+{commit.insertions}</span>{" "}
                <span className="text-red-600">-{commit.deletions}</span>
              </span>
            )}
          </div>
        </div>
      </button>

      {/* Expanded diff content */}
      {isExpanded && (
        <div className="ml-7 mb-3 border border-border rounded-md overflow-hidden">
          {diffData?.loading ? (
            <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Loading diff...
            </div>
          ) : diffData?.error ? (
            <div className="p-3 text-sm text-destructive">
              Failed to load diff: {diffData.error}
            </div>
          ) : diffData?.diff ? (
            <CommitDiffContent diff={diffData.diff} />
          ) : null}
        </div>
      )}
    </div>
  );
}

interface CommitDiffContentProps {
  diff: JjRevisionDiff;
}

function CommitDiffContent({ diff }: CommitDiffContentProps) {
  // Always show all files expanded
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(
    () => new Set(diff.hunks_by_file.map((f) => f.path))
  );

  if (diff.files.length === 0) {
    return (
      <div className="p-3 text-sm text-muted-foreground">No changes</div>
    );
  }

  const toggleFile = (path: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  return (
    <div className="divide-y divide-border">
      {diff.files.map((file) => {
        const fileDiff = diff.hunks_by_file.find((f) => f.path === file.path);
        const isFileExpanded = expandedFiles.has(file.path);

        return (
          <div key={file.path}>
            <button
              type="button"
              onClick={() => toggleFile(file.path)}
              className="flex items-center gap-2 px-3 py-1.5 w-full text-left hover:bg-muted/40 transition-colors"
            >
              <ChevronRight
                className={cn(
                  "w-3.5 h-3.5 text-muted-foreground transition-transform flex-shrink-0",
                  isFileExpanded && "rotate-90"
                )}
              />
              <FileText className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-xs font-mono truncate flex-1">
                {file.path}
              </span>
              <span
                className={cn(
                  "text-xs font-medium px-1.5 py-0.5 rounded",
                  file.status === "A" && "text-green-600 bg-green-500/10",
                  file.status === "M" && "text-blue-600 bg-blue-500/10",
                  file.status === "D" && "text-red-600 bg-red-500/10"
                )}
              >
                {file.status}
              </span>
            </button>

            {isFileExpanded && fileDiff && (
              <div className="bg-muted/20">
                {fileDiff.hunks.map((hunk) => (
                  <HunkView key={hunk.id} hunk={hunk} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface HunkViewProps {
  hunk: JjDiffHunk;
}

function HunkView({ hunk }: HunkViewProps) {
  const { oldStart, newStart } = parseHunkHeader(hunk.header);
  let oldLine = oldStart;
  let newLine = newStart;

  return (
    <div className="text-xs font-mono">
      {/* Hunk header */}
      <div className="px-3 py-0.5 bg-muted/60 text-muted-foreground border-t border-border">
        {hunk.header}
      </div>
      {/* Hunk lines */}
      {hunk.lines.map((line, i) => {
        let oldNum: number | undefined;
        let newNum: number | undefined;
        let bgClass = "";
        let prefix = " ";

        if (line.startsWith("+")) {
          newNum = newLine++;
          bgClass = "bg-emerald-500/20";
          prefix = "+";
        } else if (line.startsWith("-")) {
          oldNum = oldLine++;
          bgClass = "bg-red-500/20";
          prefix = "-";
        } else {
          oldNum = oldLine++;
          newNum = newLine++;
        }

        return (
          <div key={i} className={cn("flex", bgClass)}>
            <span className="w-10 text-right pr-1 text-muted-foreground/60 select-none flex-shrink-0">
              {oldNum ?? ""}
            </span>
            <span className="w-10 text-right pr-1 text-muted-foreground/60 select-none flex-shrink-0">
              {newNum ?? ""}
            </span>
            <span className="w-4 text-center text-muted-foreground/60 select-none flex-shrink-0">
              {prefix}
            </span>
            <span className="flex-1 whitespace-pre overflow-x-auto">
              {line.slice(1)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
