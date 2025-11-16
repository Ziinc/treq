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
 * Sanitize a plan title to create a valid git branch name
 * Format: treq/{sanitized-title}
 */
export function sanitizePlanTitleToBranchName(title: string): string {
  // Remove any non-alphanumeric characters except spaces and hyphens
  // Convert to lowercase
  // Replace spaces with hyphens
  // Remove consecutive hyphens
  // Trim hyphens from start and end
  const sanitized = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50); // Limit to 50 chars
  
  return `treq/${sanitized || 'plan'}`;
}

