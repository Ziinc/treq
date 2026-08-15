import { cn } from "../lib/utils";
import type { WorkspaceDiffStats } from "../lib/workspace-stack";

/** Half-width of each side of the bar (insertions left, deletions right), a la Gerrit. */
const DIFF_BAR_HALF_WIDTH_PX = 14;

function DiffBar({
  diffStats,
  maxChange,
}: {
  diffStats: WorkspaceDiffStats;
  maxChange: number;
}) {
  const { insertions, deletions } = diffStats;
  if (insertions === 0 && deletions === 0) return null;

  const insertionWidth =
    maxChange === 0 || insertions === 0
      ? 0
      : Math.max(
          1,
          Math.round((insertions / maxChange) * DIFF_BAR_HALF_WIDTH_PX),
        );
  const deletionWidth =
    maxChange === 0 || deletions === 0
      ? 0
      : Math.max(
          1,
          Math.round((deletions / maxChange) * DIFF_BAR_HALF_WIDTH_PX),
        );

  return (
    <div
      className="flex h-1.5 flex-shrink-0 items-center"
      title={`+${insertions} -${deletions}`}
    >
      <div
        className="flex h-full justify-end"
        style={{ width: DIFF_BAR_HALF_WIDTH_PX }}
      >
        <div
          className="h-full bg-green-600 dark:bg-green-400"
          style={{ width: insertionWidth }}
        />
      </div>
      <div className="w-px h-full bg-border" aria-hidden="true" />
      <div
        className="flex h-full justify-start"
        style={{ width: DIFF_BAR_HALF_WIDTH_PX }}
      >
        <div
          className="h-full bg-red-600 dark:bg-red-400"
          style={{ width: deletionWidth }}
        />
      </div>
    </div>
  );
}

interface WorkspaceLocIndicatorProps {
  diffStats: WorkspaceDiffStats;
  /** Largest single-direction change across the compared set; used to scale the bar. */
  maxChange: number;
  className?: string;
}

/**
 * Gerrit-style lines-of-change indicator: `+N [bar] -M`.
 * Renders nothing when both sides are zero.
 */
export function WorkspaceLocIndicator({
  diffStats,
  maxChange,
  className,
}: WorkspaceLocIndicatorProps) {
  if (diffStats.insertions === 0 && diffStats.deletions === 0) return null;

  return (
    <div
      data-testid="workspace-loc-indicator"
      className={cn("flex items-center gap-1.5", className)}
    >
      <span className="text-xs font-mono text-green-600 dark:text-green-400">
        +{diffStats.insertions}
      </span>
      <DiffBar diffStats={diffStats} maxChange={maxChange} />
      <span className="text-xs font-mono text-red-600 dark:text-red-400">
        -{diffStats.deletions}
      </span>
    </div>
  );
}
