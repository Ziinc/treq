import type { Worktree } from "./api";

/**
 * Get display title for a worktree from metadata or branch name
 */
export function getWorktreeTitle(worktree: Worktree | { metadata?: string; branch_name: string }): string {
  if (worktree.metadata) {
    try {
      const metadata = JSON.parse(worktree.metadata);
      return metadata.initial_plan_title || metadata.intent || worktree.branch_name;
    } catch {
      return worktree.branch_name;
    }
  }
  return worktree.branch_name;
}


