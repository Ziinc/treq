import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  createWorkspace,
  setWorkspaceTargetBranch,
  getRepoSetting,
  getWorkspaces,
  type Workspace,
} from "../lib/api";
import { generateStackedIntent, generateStackedBranchName } from "../lib/utils";
import { useToast } from "../components/ui/toast";

interface CreateStackedWorkspaceOptions {
  repoPath: string;
  parentBranch: string;
  parentWorkspace: Workspace | null;
}

export function useCreateStackedWorkspace() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const createStackedWorkspace = useCallback(
    async ({
      repoPath,
      parentBranch,
      parentWorkspace,
    }: CreateStackedWorkspaceOptions) => {
      try {
        // Step 1: Load branch pattern
        const branchPattern = (await getRepoSetting(
          repoPath,
          "branch_name_pattern"
        ).catch(() => null)) || "treq/{name}";

        // Step 2: Get existing workspaces to ensure unique branch name
        const existingWorkspaces = await getWorkspaces(repoPath);
        const existingBranches = new Set(
          existingWorkspaces.map((w) => w.branch_name)
        );

        // Step 3: Generate unique branch name
        let branchName = "";
        let index = 1;
        do {
          branchName = generateStackedBranchName(
            branchPattern,
            parentBranch,
            index
          );
          index++;
        } while (existingBranches.has(branchName));

        // Step 4: Generate intent from parent
        const parentIntent = parentWorkspace?.metadata
          ? (() => {
              try {
                return JSON.parse(parentWorkspace.metadata).intent || null;
              } catch {
                return null;
              }
            })()
          : null;

        const intent = generateStackedIntent(parentIntent, parentBranch);
        const metadata = JSON.stringify({ intent });

        // Step 5: Create workspace (branches from parent)
        const workspaceId = await createWorkspace(
          repoPath,
          branchName,
          true, // newBranch = true
          parentBranch, // sourceBranch = parent's branch
          metadata
        );

        // Step 6: Set target branch to parent
        const updatedWorkspaces = await getWorkspaces(repoPath);
        const createdWorkspace = updatedWorkspaces.find(
          (w) => w.id === workspaceId
        );

        if (createdWorkspace) {
          await setWorkspaceTargetBranch(
            repoPath,
            createdWorkspace.workspace_path,
            workspaceId,
            parentBranch
          );
        }

        // Step 7: Invalidate queries and notify success
        queryClient.invalidateQueries({ queryKey: ["workspaces", repoPath] });

        addToast({
          title: "Stacked workspace created",
          description: `Created ${branchName} stacked on ${parentBranch}`,
          type: "success",
        });

        // Step 8: Return the workspace ID
        return workspaceId;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        addToast({
          title: "Failed to create stacked workspace",
          description: errorMsg,
          type: "error",
        });
        throw error;
      }
    },
    [queryClient, addToast]
  );

  return { createStackedWorkspace };
}
