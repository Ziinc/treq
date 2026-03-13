import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format bytes into human-readable string (GB, MB, KB, B)
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Sanitize text for use in branch names
 * Converts to lowercase, removes special chars, replaces spaces with hyphens
 */
export function sanitizeForBranchName(text: string): string {
  let sanitized = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 50)        // truncate first
    .replace(/^-+|-+$/g, ''); // then trim hyphens

  // Remove trailing single-character alphabetic parts (e.g., "feat-thing-r" → "feat-thing")
  sanitized = sanitized.replace(/(-[a-z])$/, '');

  return sanitized || 'unnamed';
}

/** Remove trailing single-char parts and trailing separators from a branch name */
function cleanBranchNameTrailing(name: string): string {
  let result = name;
  // Loop: strip trailing separator+single-char, then trailing separators
  let prev: string;
  do {
    prev = result;
    result = result.replace(/[/.\-][a-z]$/, '');
    result = result.replace(/[/.\-]+$/, '');
  } while (result !== prev);
  return result;
}

/**
 * Apply branch name pattern with sanitized name
 * @param pattern - Pattern with {name} placeholder (e.g., "treq/{name}")
 * @param name - The name/intent to insert
 */
export function applyBranchNamePattern(pattern: string, name: string): string {
  const sanitized = sanitizeForBranchName(name);
  const result = cleanBranchNameTrailing(pattern.replace(/\{name\}/g, sanitized));
  return result || 'unnamed';
}

/**
 * Extract filename from a file path
 */
export function getFileName(path: string): string {
  if (!path) return "";
  // Handle both Unix (/) and Windows (\) separators
  const lastSeparator = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return lastSeparator === -1 ? path : path.slice(lastSeparator + 1);
}

/**
 * Escape a string for use in bash $'...' syntax
 * Escapes backslashes, single quotes, and newlines to pass multi-line strings correctly
 * @param str - The string to escape
 * @returns Escaped string suitable for bash $'...' syntax
 */
export function escapeBashString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')     // escape backslashes first
    .replace(/'/g, "\\'")        // escape single quotes
    .replace(/\n/g, '\\n');      // escape newlines
}

/**
 * Parse jj timestamp format ("2025-01-15 10:30:45.000 +08:00") into a Date.
 * Returns null if the timestamp cannot be parsed.
 */
function parseTimestamp(timestamp: string): Date | null {
  try {
    // Normalize jj format to ISO 8601:
    //   "2025-01-15 10:30:45.000 +08:00" → "2025-01-15T10:30:45.000+08:00"
    // Replace first space (between date and time) with T,
    // then remove space before timezone offset.
    const iso = timestamp
      .replace(/^(\d{4}-\d{2}-\d{2})\s/, "$1T")
      .replace(/\s([+-]\d{2}:\d{2})$/, "$1");
    const date = new Date(iso);
    if (isNaN(date.getTime())) return null;
    return date;
  } catch {
    return null;
  }
}

/**
 * Format timestamp as relative time (e.g., "5 minutes ago", "2 hours ago", "3 days ago")
 * @param timestamp - Timestamp in jj format: "YYYY-MM-DD HH:MM:SS.mmm +TZ:TZ"
 * @returns Relative time string
 */
export function formatRelativeTime(timestamp: string): string {
  const date = parseTimestamp(timestamp);
  if (!date) return timestamp;

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffSeconds < 10) return "just now";
  if (diffSeconds < 60) return `${diffSeconds} seconds ago`;
  if (diffMinutes === 1) return "1 minute ago";
  if (diffMinutes < 60) return `${diffMinutes} minutes ago`;
  if (diffHours === 1) return "1 hour ago";
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays === 1) return "1 day ago";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffWeeks === 1) return "1 week ago";
  if (diffWeeks < 4) return `${diffWeeks} weeks ago`;
  if (diffMonths === 1) return "1 month ago";
  if (diffMonths < 12) return `${diffMonths} months ago`;
  if (diffYears === 1) return "1 year ago";
  return `${diffYears} years ago`;
}

/**
 * Format timestamp for display in tooltip
 * @param timestamp - Timestamp in jj format: "YYYY-MM-DD HH:MM:SS.mmm +TZ:TZ"
 * @returns Formatted timestamp string
 */
export function formatFullTimestamp(timestamp: string): string {
  const date = parseTimestamp(timestamp);
  if (!date) return timestamp;

  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short'
  });
}

/**
 * Get a "YYYY-MM-DD" day key from a jj timestamp for grouping commits by day.
 */
export function getDayKey(timestamp: string): string {
  const date = parseTimestamp(timestamp);
  if (!date) return "unknown";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Format a jj timestamp into a human-friendly day label.
 * Returns "Today", "Yesterday", or "Jan 15, 2025".
 */
export function formatDayLabel(timestamp: string): string {
  const date = parseTimestamp(timestamp);
  if (!date) return timestamp;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Generate stacked workspace intent from parent workspace/branch
 * @param parentIntent - Parent workspace intent (if exists)
 * @param parentBranch - Parent branch name
 * @returns Generated intent string
 */
export function generateStackedIntent(
  parentIntent: string | null,
  parentBranch: string
): string {
  if (parentIntent) {
    return `${parentIntent}\n\nStacked from ${parentBranch}`;
  }
  return `Stacked from ${parentBranch}`;
}

/**
 * Generate stacked workspace branch name with enumeration
 * @param branchPattern - Branch naming pattern (e.g., "treq/{name}")
 * @param parentBranch - Parent branch name
 * @param index - Index for uniqueness (always added, starts from 1)
 * @returns Generated branch name (e.g., "treq/main-stack-1", "treq/main-stack-2")
 */
export function generateStackedBranchName(
  branchPattern: string,
  parentBranch: string,
  index: number = 1
): string {
  const baseName = `${parentBranch}-stack-${index}`;
  return applyBranchNamePattern(branchPattern, baseName);
}

/**
 * Construct the full workspace path from a Workspace object
 * The workspace_path in the database is just the directory name,
 * so we need to reconstruct the full path: {repo_path}/.treq/workspaces/{workspace_path}
 * Handles legacy workspaces where workspace_path might already be a full absolute path.
 */
export function getFullWorkspacePath(
  workspace: { repo_path: string; workspace_path: string }
): string {
  // If workspace_path is already an absolute path, return it as-is
  if (workspace.workspace_path.startsWith("/")) {
    return workspace.workspace_path;
  }
  return `${workspace.repo_path}/.treq/workspaces/${workspace.workspace_path}`;
}

