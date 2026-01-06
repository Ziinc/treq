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
  const sanitized = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50); // Limit to 50 chars
  
  return sanitized || 'unnamed';
}

/**
 * Apply branch name pattern with sanitized name
 * @param pattern - Pattern with {name} placeholder (e.g., "treq/{name}")
 * @param name - The name/intent to insert
 */
export function applyBranchNamePattern(pattern: string, name: string): string {
  const sanitized = sanitizeForBranchName(name);
  return pattern.replace(/\{name\}/g, sanitized);
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
 * Format timestamp as relative time (e.g., "5 minutes ago", "2 hours ago", "3 days ago")
 * @param timestamp - Timestamp in jj format: "YYYY-MM-DD HH:MM:SS.mmm +TZ:TZ"
 * @returns Relative time string
 */
export function formatRelativeTime(timestamp: string): string {
  try {
    const date = new Date(timestamp);
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
  } catch (e) {
    return timestamp;
  }
}

/**
 * Format timestamp for display in tooltip
 * @param timestamp - Timestamp in jj format: "YYYY-MM-DD HH:MM:SS.mmm +TZ:TZ"
 * @returns Formatted timestamp string
 */
export function formatFullTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    });
  } catch (e) {
    return timestamp;
  }
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

