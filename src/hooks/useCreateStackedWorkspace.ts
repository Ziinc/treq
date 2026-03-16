import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
	createWorkspace,
	setWorkspaceTargetBranch,
	getRepoSetting,
	getWorkspaces,
	type Workspace,
} from "../lib/api";
import {
	generateStackedIntent,
	generateStackedBranchName,
	getFullWorkspacePath,
} from "../lib/utils";
import { useToast } from "../components/ui/toast";

export interface CreateStackedWorkspaceOptions {
	repoPath: string;
	parentBranch: string;
	parentWorkspace: Workspace | null;
	/** If provided, use this branch name instead of auto-generating */
	branchName?: string;
	/** If provided, use this intent instead of auto-generating */
	intent?: string;
	/** Position relative to parent. "before" triggers reparenting. Default: "after" */
	position?: "before" | "after";
}

export function useCreateStackedWorkspace() {
	const queryClient = useQueryClient();
	const { addToast } = useToast();

	const createStackedWorkspace = useCallback(
		async ({
			repoPath,
			parentBranch,
			parentWorkspace,
			branchName: userBranchName,
			intent: userIntent,
			position = "after",
		}: CreateStackedWorkspaceOptions) => {
			try {
				// Step 1: Load branch pattern (only needed if auto-generating)
				const branchPattern = userBranchName
					? "treq/{name}" // unused but need a fallback
					: (await getRepoSetting(repoPath, "branch_name_pattern").catch(
							() => null,
						)) || "treq/{name}";

				// Step 2: Get existing workspaces to ensure unique branch name
				const existingWorkspaces = await getWorkspaces(repoPath);
				const existingBranches = new Set(
					existingWorkspaces.map((w) => w.branch_name),
				);

				// Step 3: Determine branch name
				let branchName: string;
				if (userBranchName) {
					branchName = userBranchName;
				} else {
					let index = 1;
					do {
						branchName = generateStackedBranchName(
							branchPattern,
							parentBranch,
							index,
						);
						index++;
					} while (existingBranches.has(branchName));
				}

				// Step 4: Determine intent
				let intent: string;
				if (userIntent !== undefined) {
					intent = userIntent;
				} else {
					const parentIntent = parentWorkspace?.metadata
						? (() => {
								try {
									return JSON.parse(parentWorkspace.metadata).intent || null;
								} catch {
									return null;
								}
							})()
						: null;
					intent = generateStackedIntent(parentIntent, parentBranch);
				}
				const metadata = JSON.stringify({ intent });

				// For "before" position, the new workspace targets the parent's parent
				// and then the original parent gets reparented onto the new workspace
				const effectiveParentBranch =
					position === "before" && parentWorkspace?.target_branch
						? parentWorkspace.target_branch
						: parentBranch;

				// Step 5: Create workspace (branches from effective parent)
				const workspaceId = await createWorkspace(
					repoPath,
					branchName,
					effectiveParentBranch,
					metadata,
				);

				// Step 6: Set target branch
				const updatedWorkspaces = await getWorkspaces(repoPath);
				const createdWorkspace = updatedWorkspaces.find(
					(w) => w.id === workspaceId,
				);

				if (createdWorkspace) {
					const fullPath = getFullWorkspacePath(createdWorkspace);
					await setWorkspaceTargetBranch(
						repoPath,
						fullPath,
						workspaceId,
						effectiveParentBranch,
					);
				}

				// Step 7: If "before", reparent the original workspace onto the new one
				if (position === "before" && parentWorkspace) {
					const originalFullPath = getFullWorkspacePath(parentWorkspace);
					await setWorkspaceTargetBranch(
						repoPath,
						originalFullPath,
						parentWorkspace.id,
						branchName,
					);
				}

				// Step 8: Invalidate queries and notify success
				queryClient.invalidateQueries({ queryKey: ["workspaces", repoPath] });

				addToast({
					title: "Stacked workspace created",
					description: `Created ${branchName} stacked on ${effectiveParentBranch}`,
					type: "success",
				});

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
		[queryClient, addToast],
	);

	return { createStackedWorkspace };
}
