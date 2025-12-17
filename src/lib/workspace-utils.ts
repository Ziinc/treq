import type { Workspace } from "./api";

/**
 * Get display title for a workspace from metadata or branch name
 */
export function getWorkspaceTitle(workspace: Workspace | { metadata?: string; branch_name: string }): string {
  if (workspace.metadata) {
    try {
      const metadata = JSON.parse(workspace.metadata);
      return metadata.intent || workspace.branch_name;
    } catch {
      return workspace.branch_name;
    }
  }
  return workspace.branch_name;
}
