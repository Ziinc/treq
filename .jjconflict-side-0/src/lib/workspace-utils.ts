import type { Workspace } from "./api";

/**
 * Get display title for a workspace - always returns branch_name
 */
export function getWorkspaceTitle(workspace: Workspace | { metadata?: string; branch_name: string }): string {
  return workspace.branch_name;
}
