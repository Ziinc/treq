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
 * Sanitize a plan title to create a valid git branch name
 * Format: treq/{sanitized-title}
 * @deprecated Use applyBranchNamePattern with pattern from settings instead
 */
export function sanitizePlanTitleToBranchName(title: string): string {
  return applyBranchNamePattern("treq/{name}", title);
}

