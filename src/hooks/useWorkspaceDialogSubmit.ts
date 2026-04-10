import {
	type BranchStatus,
	type Workspace,
	createWorkspace,
	getWorkspaces,
	moveCommitToExistingWorkspace,
	setWorkspaceTargetBranch,
	splitWorkspace,
} from "../lib/api";
import { getFullWorkspacePath } from "../lib/utils";
import { useCreateStackedWorkspace } from "./useCreateStackedWorkspace";
import { useToast } from "../components/ui/toast";

export interface UseWorkspaceDialogSubmitParams {
	repoPath: string;
	intent: string;
	branchName: string;
	moveToExisting: boolean;
	isHomeRepo: boolean;
	hasSourceWorkspace: boolean;
	sourceWorkspace: Workspace | null;
	position: "before" | "after";
	targetBranch: string | null;
	allWorkspaces: Workspace[];
	branchStatusData: BranchStatus | null;
	activeRightTab: "commits" | "changes";
	selectedCommits: Set<string>;
	selectedHunks: Set<string>;
	selectedFilePaths: string[];
	targetWorkspaceId: number | null;
	canSubmit: boolean;
	setLoading: (v: boolean) => void;
	setError: (v: string) => void;
	onSuccess: (workspaceId: number) => void;
	onOpenChange: (open: boolean) => void;
}

export function useWorkspaceDialogSubmit(
	params: UseWorkspaceDialogSubmitParams,
) {
	const {
		repoPath,
		intent,
		branchName,
		moveToExisting,
		isHomeRepo,
		hasSourceWorkspace,
		sourceWorkspace,
		position,
		targetBranch,
		allWorkspaces,
		branchStatusData,
		activeRightTab,
		selectedCommits,
		selectedHunks,
		selectedFilePaths,
		targetWorkspaceId,
		canSubmit,
		setLoading,
		setError,
		onSuccess,
		onOpenChange,
	} = params;

	const { addToast } = useToast();
	const { createStackedWorkspace } = useCreateStackedWorkspace();

	const handleSubmit = async () => {
		if (!canSubmit) return;
		setLoading(true);
		setError("");

		try {
			if (moveToExisting && targetWorkspaceId !== null && sourceWorkspace) {
				if (activeRightTab === "commits" && selectedCommits.size > 0) {
					await Promise.all(
						Array.from(selectedCommits).map((changeId) =>
							moveCommitToExistingWorkspace(
								repoPath,
								sourceWorkspace.id,
								changeId,
								targetWorkspaceId,
							),
						),
					);
					const targetWs = allWorkspaces.find((w) => w.id === targetWorkspaceId);
					addToast({
						title: "Commits moved",
						description: `Moved to workspace: ${targetWs?.branch_name ?? ""}`,
						type: "success",
					});
					onSuccess(targetWorkspaceId);
					onOpenChange(false);
					return;
				} else if (activeRightTab === "changes" && selectedHunks.size > 0) {
					setError(
						"Moving files to an existing workspace is not yet supported. Please create a new workspace instead.",
					);
					setLoading(false);
					return;
				}
				setError("Please select commits to move");
				setLoading(false);
				return;
			}

			if (
				sourceWorkspace &&
				selectedCommits.size > 0 &&
				activeRightTab === "commits"
			) {
				const newWorkspaceId = await splitWorkspace(
					repoPath,
					sourceWorkspace.id,
					branchName,
					intent.trim() || null,
					null,
					Array.from(selectedCommits),
					"move",
					position,
				);
				addToast({
					title: "Workspace created",
					description: `Moved ${selectedCommits.size} commit(s) to ${branchName}`,
					type: "success",
				});
				onSuccess(newWorkspaceId);
				onOpenChange(false);
				return;
			}

			if (
				sourceWorkspace &&
				selectedHunks.size > 0 &&
				activeRightTab === "changes"
			) {
				const newWorkspaceId = await splitWorkspace(
					repoPath,
					sourceWorkspace.id,
					branchName,
					intent.trim() || null,
					selectedFilePaths,
					null,
					"move",
					position,
				);
				addToast({
					title: "Workspace split",
					description: `Moved ${selectedFilePaths.length} file(s) to ${branchName}`,
					type: "success",
				});
				onSuccess(newWorkspaceId);
				onOpenChange(false);
				return;
			}

			if (isHomeRepo && selectedHunks.size > 0) {
				const metadata = JSON.stringify({
					intent: intent.trim() || undefined,
					moved_files: selectedFilePaths,
				});
				const workspaceId = await createWorkspace(
					repoPath,
					branchName,
					undefined,
					metadata,
				);
				addToast({
					title: "Workspace created",
					description: `Created ${branchName} with ${selectedFilePaths.length} file(s) moved`,
					type: "success",
				});
				onSuccess(workspaceId);
				onOpenChange(false);
				return;
			}

			if (hasSourceWorkspace && sourceWorkspace) {
				const workspaceId = await createStackedWorkspace({
					repoPath,
					parentBranch: sourceWorkspace.branch_name,
					parentWorkspace: sourceWorkspace,
					branchName,
					intent: intent.trim() || undefined,
					position,
				});
				onSuccess(workspaceId);
				onOpenChange(false);
				return;
			}

			{
				let targetWorkspacePath: string | undefined;
				if (targetBranch) {
					const existingTarget = allWorkspaces.find(
						(w) => w.branch_name === targetBranch,
					);
					if (!existingTarget) {
						const targetWsId = await createWorkspace(
							repoPath,
							targetBranch,
							undefined,
							JSON.stringify({ intent: `Workspace for ${targetBranch}` }),
						);
						const updatedWorkspaces = await getWorkspaces(repoPath);
						const createdTarget = updatedWorkspaces.find((w) => w.id === targetWsId);
						if (createdTarget) targetWorkspacePath = createdTarget.workspace_path;
					} else {
						targetWorkspacePath = existingTarget.workspace_path;
					}
				}

				const metadata = intent.trim()
					? JSON.stringify({ intent: intent.trim() })
					: JSON.stringify({});

				let effectiveSourceBranch: string | undefined;
				if (branchStatusData?.remote_exists && branchStatusData.remote_ref) {
					effectiveSourceBranch = branchStatusData.remote_ref;
				}

				const workspaceId = await createWorkspace(
					repoPath,
					branchName,
					effectiveSourceBranch,
					metadata,
				);

				if (targetBranch && targetWorkspacePath) {
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
							targetBranch,
						);
					}
				}

				addToast({
					title: "Workspace created",
					description: `Created workspace for branch ${branchName}`,
					type: "success",
				});
				onSuccess(workspaceId);
				onOpenChange(false);
			}
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			setError(errorMsg);
			addToast({
				title: "Failed to create workspace",
				description: errorMsg,
				type: "error",
			});
		} finally {
			setLoading(false);
		}
	};

	return { handleSubmit };
}
