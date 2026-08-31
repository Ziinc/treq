import { DiffBar } from "./DiffBar";
import { cn } from "../lib/utils";
import {
  locSignedCountCh,
  type WorkspaceDiffStats,
} from "../lib/workspace-stack";

interface WorkspaceLocIndicatorProps {
  diffStats: WorkspaceDiffStats;
  /** Largest single-direction change across the compared set; used to scale the bar. */
  maxChange: number;
  /**
   * Shared `ch` width of the +N column across a stack. Defaults to this
   * row's own insertion count.
   */
  insertionsCh?: number;
  /**
   * Shared `ch` width of the -N column across a stack. Defaults to this
   * row's own deletion count.
   */
  deletionsCh?: number;
  className?: string;
}

/**
 * Gerrit-style lines-of-change indicator: `+N [bar] -M`.
 * Renders nothing when both sides are zero.
 */
export function WorkspaceLocIndicator({
  diffStats,
  maxChange,
  insertionsCh,
  deletionsCh,
  className,
}: WorkspaceLocIndicatorProps) {
  if (diffStats.insertions === 0 && diffStats.deletions === 0) return null;

  const plusCh = insertionsCh ?? locSignedCountCh(diffStats.insertions);
  const minusCh = deletionsCh ?? locSignedCountCh(diffStats.deletions);

  return (
    <div
      data-testid="workspace-loc-indicator"
      className={cn("grid items-center gap-x-1.5", className)}
      style={{
        gridTemplateColumns: `${plusCh}ch auto ${minusCh}ch`,
      }}
    >
      <span className="text-right text-xs font-mono tabular-nums text-green-600 dark:text-green-400">
        +{diffStats.insertions}
      </span>
      <DiffBar diffStats={diffStats} maxChange={maxChange} />
      <span className="text-left text-xs font-mono tabular-nums text-red-600 dark:text-red-400">
        -{diffStats.deletions}
      </span>
    </div>
  );
}
