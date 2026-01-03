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

