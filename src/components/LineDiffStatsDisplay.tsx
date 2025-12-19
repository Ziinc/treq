import { memo } from "react";
import { cn } from "../lib/utils";

// Define LineDiffStats locally since git API was removed
export interface LineDiffStats {
  lines_added: number;
  lines_deleted: number;
}

interface LineDiffStatsDisplayProps {
  stats: LineDiffStats | null;
  isLoading?: boolean;
  className?: string;
  size?: "xs" | "sm" | "md";
}

export const LineDiffStatsDisplay = memo<LineDiffStatsDisplayProps>(
  function LineDiffStatsDisplay({ stats, isLoading, className, size = "sm" }) {
    if (isLoading) {
      return <span className={cn("text-muted-foreground", className)}>...</span>;
    }

    if (!stats || (stats.lines_added === 0 && stats.lines_deleted === 0)) {
      return null;
    }

    const sizeClasses = {
      xs: "text-[10px]",
      sm: "text-sm",
      md: "text-sm",
    };

    return (
      <span className={cn("inline-flex items-center gap-1 font-mono", sizeClasses[size], className)}>
        {stats.lines_added > 0 && (
          <span className="text-green-600 dark:text-green-400">
            +{stats.lines_added}
          </span>
        )}
        {stats.lines_added > 0 && stats.lines_deleted > 0 && (
          <span className="text-muted-foreground">/</span>
        )}
        {stats.lines_deleted > 0 && (
          <span className="text-red-600 dark:text-red-400">
            -{stats.lines_deleted}
          </span>
        )}
      </span>
    );
  }
);
