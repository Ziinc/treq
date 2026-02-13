import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  setWorkspaceTargetBranch,
  getWorkspaces,
  type Workspace,
} from "../lib/api";
import { getFullWorkspacePath } from "../lib/utils";
import { isDescendantOf } from "../lib/workspace-tree";
import { useCreateStackedWorkspace } from "./useCreateStackedWorkspace";

interface UseWorkspaceHierarchyOptions {
  repoPath: string;
  workspaces: Workspace[];
  defaultBranch?: string;
}

export function useWorkspaceHierarchy({
  repoPath,
  workspaces,
  defaultBranch = "main",
}: UseWorkspaceHierarchyOptions) {
  const queryClient = useQueryClient();
  const { createStackedWorkspace } = useCreateStackedWorkspace();

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["workspaces", repoPath] });
    queryClient.invalidateQueries({ queryKey: ["workspace-statuses", repoPath] });
  }, [queryClient, repoPath]);

  /**
   * Add a new workspace after (as a child of) the given workspace.
   */
  const addAfter = useCallback(
    async (workspace: Workspace): Promise<number> => {
      const workspaceId = await createStackedWorkspace({
        repoPath,
        parentBranch: workspace.branch_name,
        parentWorkspace: workspace,
      });
      invalidate();
      return workspaceId;
    },
    [repoPath, createStackedWorkspace, invalidate]
  );

  /**
   * Add a new workspace before the given workspace.
   * Creates a new workspace C stacked on the original's parent,
   * then reparents the original workspace onto C.
   */
  const addBefore = useCallback(
    async (workspace: Workspace): Promise<number> => {
      const parentBranch = workspace.target_branch || defaultBranch;

      // Create new workspace stacked on the original's parent
      const newWorkspaceId = await createStackedWorkspace({
        repoPath,
        parentBranch,
        parentWorkspace: null,
      });

      // Fetch updated workspaces to get the new workspace's branch_name
      const updatedWorkspaces = await getWorkspaces(repoPath);
      const newWorkspace = updatedWorkspaces.find(w => w.id === newWorkspaceId);

      if (newWorkspace) {
        // Reparent original workspace onto the new workspace
        const fullPath = getFullWorkspacePath(workspace);
        await setWorkspaceTargetBranch(
          repoPath,
          fullPath,
          workspace.id,
          newWorkspace.branch_name
        );
      }

      invalidate();
      return newWorkspaceId;
    },
    [repoPath, defaultBranch, createStackedWorkspace, invalidate]
  );

  /**
   * Move a workspace to a new target branch.
   * Validates no cycles would be created.
   */
  const moveWorkspace = useCallback(
    async (workspace: Workspace, newTargetBranch: string | null): Promise<void> => {
      const targetBranch = newTargetBranch ?? defaultBranch;

      // Prevent self-targeting
      if (targetBranch === workspace.branch_name) {
        throw new Error("Cannot target self: would create a cycle");
      }

      // Prevent cycles: check if targetBranch is a descendant of workspace
      if (newTargetBranch !== null && isDescendantOf(workspaces, targetBranch, workspace.branch_name)) {
        throw new Error("Cannot move: would create a cycle");
      }

      const fullPath = getFullWorkspacePath(workspace);
      await setWorkspaceTargetBranch(
        repoPath,
        fullPath,
        workspace.id,
        targetBranch
      );

      invalidate();
    },
    [repoPath, workspaces, defaultBranch, invalidate]
  );

  return { addAfter, addBefore, moveWorkspace };
}
