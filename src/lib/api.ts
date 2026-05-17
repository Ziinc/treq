import type {
	BranchStatus,
	DirectoryEntry,
	EditorAppsResponse,
	JjBranch,
	JjCommitsAhead,
	JjDiffHunk,
	JjFileChange,
	JjFileDiff,
	JjFileLines,
	JjLogResult,
	JjRebaseResult,
	JjRevisionDiff,
	MergeStrategy,
	PullWorkspaceResult,
	RepoBranch,
	RenameWorkspaceResult,
	SingleRebaseResult,
	Workspace,
	WorkspaceSidebarStatus,
	WorkspaceStatus,
} from "./api-types";

import { invoke } from "@tauri-apps/api/core";

export * from "./api-extra";
export * from "./api-types";

export const initRepo = (repoPath: string): Promise<void> =>
	invoke("init_repo", { repoPath });

// Database API
export const getWorkspaces = (repoPath: string): Promise<Workspace[]> =>
	invoke("get_workspaces", { repoPath });

export const getRepoBranch = (repoPath: string): Promise<RepoBranch> =>
	invoke("get_repo_branch", { repoPath });

export const createWorkspace = (
	...args: [
		repoPath: string,
		branchName: string,
		sourceBranch?: string,
		metadata?: string,
	]
): Promise<number> => {
	const [repoPath, branchName, sourceBranch, metadata] = args;
	return invoke("create_workspace", {
		repoPath,
		branchName,
		sourceBranch: sourceBranch ?? null,
		metadata: metadata ?? null,
	});
};

export const deleteWorkspace = (repoPath: string, id: number): Promise<void> =>
	invoke("delete_workspace", {
		repoPath,
		id,
	});

export const ensureWorkspaceIndexed = (
	repoPath: string,
	workspaceId: number | null,
	workspacePath: string,
): Promise<boolean> =>
	invoke("ensure_workspace_indexed", {
		repoPath,
		workspaceId,
		workspacePath,
	});

export const getSetting = (key: string): Promise<string | null> =>
	invoke("get_setting", { key });

export const getSettingsBatch = (
	keys: string[],
): Promise<Record<string, string | null>> =>
	invoke("get_settings_batch", { keys });

export const setSetting = (key: string, value: string): Promise<void> =>
	invoke("set_setting", { key, value });

export const getRepoSetting = (
	repoPath: string,
	key: string,
): Promise<string | null> => invoke("get_repo_setting", { repoPath, key });

export const setRepoSetting = (
	repoPath: string,
	key: string,
	value: string,
): Promise<void> => invoke("set_repo_setting", { repoPath, key, value });

export const setWindowRepoPath = (repoPath: string): Promise<void> =>
	invoke("set_window_repo_path", { repoPath });

export const getWindowRepoPath = (): Promise<string | null> =>
	invoke("get_window_repo_path");

export const detectEditorApps = (): Promise<EditorAppsResponse> =>
	invoke("detect_editor_apps");

// JJ Workspace API
// JJ Diff API
export const getWorkspaceChangedFiles = (
	repoPath: string,
	workspaceId: number | null,
): Promise<JjFileChange[]> =>
	invoke("get_workspace_changed_files", { repoPath, workspaceId });

export const getWorkspaceConflictedFiles = (
	repoPath: string,
	workspaceId: number | null,
): Promise<string[]> =>
	invoke("get_workspace_conflicted_files", { repoPath, workspaceId });

export const lsWorkspace = (
	repoPath: string,
	workspaceId: number | null,
): Promise<DirectoryEntry[]> =>
	invoke("ls_workspace", { repoPath, workspaceId });

export const getWorkspaceReadme = (
	repoPath: string,
	workspaceId: number | null,
): Promise<string | null> =>
	invoke("get_workspace_readme", { repoPath, workspaceId });

export const getWorkspaceFileHunks = (
	repoPath: string,
	workspaceId: number | null,
	filePath: string,
): Promise<JjDiffHunk[]> =>
	invoke("get_workspace_file_hunks", {
		repoPath,
		workspaceId,
		filePath,
	});

export const getWorkspaceFileLines = (
	...args: [
		repoPath: string,
		workspaceId: number | null,
		filePath: string,
		fromParent: boolean,
		startLine: number,
		endLine: number,
	]
): Promise<JjFileLines> => {
	const [repoPath, workspaceId, filePath, fromParent, startLine, endLine] =
		args;
	return invoke("get_workspace_file_lines", {
		repoPath,
		workspaceId,
		filePath,
		fromParent,
		startLine,
		endLine,
	});
};

export const jjRestoreFile = (
	workspacePath: string,
	filePath: string,
): Promise<string> =>
	invoke("jj_restore_file", {
		workspacePath,
		filePath,
	});

export const jjRestoreAll = (workspacePath: string): Promise<string> =>
	invoke("jj_restore_all", { workspacePath });

export const createCommit = (
	repoPath: string,
	workspaceId: number | null,
	message: string,
): Promise<string> =>
	invoke("create_commit", {
		repoPath,
		workspaceId,
		message,
	});

export const listCommits = (
	...args: [
		repoPath: string,
		workspaceId: number | null,
		includeTargetBranchHistory?: boolean,
		targetBranchLimit?: number,
		limit?: number,
	]
): Promise<JjLogResult> => {
	const [
		repoPath,
		workspaceId,
		includeTargetBranchHistory,
		targetBranchLimit,
		limit,
	] = args;
	return invoke("list_commits", {
		repoPath,
		workspaceId,
		includeTargetBranchHistory: includeTargetBranchHistory ?? false,
		targetBranchLimit: targetBranchLimit ?? null,
		limit: limit ?? null,
	});
};

export const jjSplit = (
	workspacePath: string,
	message: string,
	filePaths: string[],
): Promise<string> =>
	invoke("jj_split", {
		workspacePath,
		message,
		filePaths,
	});

export const listRepoBranches = (repoPath: string): Promise<JjBranch[]> =>
	invoke("list_repo_branches", { repoPath });

export const switchRepoBranch = (
	repoPath: string,
	bookmarkName: string,
): Promise<string> =>
	invoke("switch_repo_branch", {
		repoPath,
		bookmarkName,
	});

export interface SyncStatus {
	ahead: number;
	behind: number;
}

export const jjGitFetchBackground = (repoPath: string): Promise<void> =>
	invoke("jj_git_fetch_background", { repoPath });

export const pullWorkspaceFromRemote = (
	repoPath: string,
	workspaceId: number | null,
): Promise<PullWorkspaceResult> =>
	invoke("pull_workspace_from_remote", {
		repoPath,
		workspaceId,
	});

export const checkBranchExists = (
	repoPath: string,
	branchName: string,
): Promise<BranchStatus> =>
	invoke("jj_check_branch_exists", {
		repoPath,
		branchName,
	});

export const getCommitDiff = (
	repoPath: string,
	workspaceId: number | null,
	revision: string,
): Promise<JjRevisionDiff> =>
	invoke("get_commit_diff", { repoPath, workspaceId, revision });

export const getCommitFileDiff = (
	...args: [
		repoPath: string,
		workspaceId: number | null,
		revision: string,
		filePath: string,
	]
): Promise<JjFileDiff> => {
	const [repoPath, workspaceId, revision, filePath] = args;
	return invoke("get_commit_file_diff", {
		repoPath,
		workspaceId,
		revision,
		filePath,
	});
};

export const jjGetCommitsAhead = (
	workspacePath: string,
	targetBranch: string,
): Promise<JjCommitsAhead> =>
	invoke("jj_get_commits_ahead", { workspacePath, targetBranch });

export const getWorkspaceDiff = (
	repoPath: string,
	workspaceId: number,
): Promise<JjRevisionDiff> =>
	invoke("get_workspace_diff", { repoPath, workspaceId });

export const splitWorkspace = (
	...args: [
		repoPath: string,
		workspaceId: number,
		branchName: string,
		intent: string | null,
		filePaths: string[] | null,
		commitIds: string[] | null,
		mode: "move" | "copy",
		position: "before" | "after",
	]
): Promise<number> => {
	const [
		repoPath,
		workspaceId,
		branchName,
		intent,
		filePaths,
		commitIds,
		mode,
		position,
	] = args;
	return invoke("split_workspace", {
		repoPath,
		workspaceId,
		branchName,
		intent,
		filePaths,
		commitIds,
		mode,
		position,
	});
};

export const renameWorkspace = (
	...args: [
		repoPath: string,
		workspaceId: number,
		newBranchName: string,
		dryRun: boolean,
	]
): Promise<RenameWorkspaceResult> => {
	const [repoPath, workspaceId, newBranchName, dryRun] = args;
	return invoke("rename_workspace", {
		repoPath,
		workspaceId,
		newBranchName,
		dryRun,
	});
};

export const mergeWorkspace = (
	...args: [
		repoPath: string,
		workspaceId: number,
		message: string,
		mergeStrategy: MergeStrategy,
	]
): Promise<void> => {
	const [repoPath, workspaceId, message, mergeStrategy] = args;
	return invoke("merge_workspace", {
		repoPath,
		workspaceId,
		message,
		mergeStrategy,
	});
};

export const pushWorkspaceToRemote = (
	repoPath: string,
	workspaceId: number | null,
): Promise<string> =>
	invoke("push_workspace_to_remote", {
		repoPath,
		workspaceId,
	});

export const listWorkspaceStatuses = (
	repoPath: string,
): Promise<WorkspaceSidebarStatus[]> =>
	invoke("list_workspace_statuses", {
		repoPath,
	});

export const getWorkspaceStatus = (
	repoPath: string,
	workspaceId: number | null,
): Promise<WorkspaceStatus> =>
	invoke("get_workspace_status", {
		repoPath,
		workspaceId,
	});

export const updateWorkspace = (
	...args: [
		repoPath: string,
		workspaceId: number,
		targetBranch?: string,
		intent?: string,
	]
): Promise<Workspace> => {
	const [repoPath, workspaceId, targetBranch, intent] = args;
	return invoke("update_workspace", {
		repoPath,
		workspaceId,
		...(targetBranch !== undefined && { targetBranch }),
		...(intent !== undefined && { intent }),
	});
};

export const setWorkspaceTargetBranch = (
	...args: [
		repoPath: string,
		workspacePath: string,
		id: number,
		targetBranch: string,
	]
): Promise<JjRebaseResult> => {
	const [repoPath, workspacePath, id, targetBranch] = args;
	return invoke("set_workspace_target_branch", {
		repoPath,
		workspacePath,
		id,
		targetBranch,
	});
};

// Kept for compatibility with existing mocks/consumers while unused in app runtime.
// Intentionally left empty.

export const checkAndRebaseWorkspaces = (
	...args: [
		repoPath: string,
		workspaceId?: number | null,
		defaultBranch?: string | null,
		force?: boolean,
	]
): Promise<SingleRebaseResult> => {
	const [repoPath, workspaceId, defaultBranch, force] = args;
	return invoke("check_and_rebase_workspaces", {
		repoPath,
		workspaceId: workspaceId ?? null,
		defaultBranch: defaultBranch ?? null,
		force: force ?? null,
	});
};

export const resolveBookmarkConflict = (
	...args: [
		repoPath: string,
		workspaceId: number,
		workspacePath: string,
		branchName: string,
		revisionId: string,
	]
): Promise<JjRebaseResult> => {
	const [repoPath, workspaceId, workspacePath, branchName, revisionId] = args;
	return invoke("resolve_workspace_bookmark_conflict", {
		repoPath,
		workspaceId,
		workspacePath,
		branchName,
		revisionId,
	});
};

// PTY API
