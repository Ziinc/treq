import type { ParsedFileChange } from "./git-utils";

/**
 * Git status colors for different change types
 */
export const GIT_STATUS_COLORS = {
  A: {
    bg: "bg-green-500",
    text: "text-green-500",
  },
  M: {
    bg: "bg-yellow-500",
    text: "text-yellow-500",
  },
  D: {
    bg: "bg-red-500",
    text: "text-red-500",
  },
  R: {
    bg: "bg-blue-500",
    text: "text-blue-500",
  },
  "??": {
    bg: "bg-green-500",
    text: "text-green-500",
  },
} as const;

/**
 * Get background color class for a git status code
 */
export function getStatusBgColor(status?: string): string {
  if (!status) return "bg-muted";
  return GIT_STATUS_COLORS[status as keyof typeof GIT_STATUS_COLORS]?.bg || "bg-muted";
}

/**
 * Get text color class for a git status code
 */
export function getStatusTextColor(status?: string): string {
  if (!status) return "";
  return GIT_STATUS_COLORS[status as keyof typeof GIT_STATUS_COLORS]?.text || "text-yellow-500";
}

/**
 * Get text color class for a parsed file change
 * Handles both staged and workspace status
 */
export function getFileStatusTextColor(file: ParsedFileChange | undefined): string {
  if (!file) return "";
  if (file.isUntracked) return "text-green-500";
  if (file.workspaceStatus === "M" || file.stagedStatus === "M") return "text-yellow-500";
  if (file.workspaceStatus === "A" || file.stagedStatus === "A") return "text-green-500";
  if (file.workspaceStatus === "D" || file.stagedStatus === "D") return "text-red-500";
  return "text-yellow-500"; // default for any other change
}
