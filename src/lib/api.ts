import type {
	BookmarkTrackingResult,
	BranchStatus,
	EditorAppsResponse,
	JjBranch,
	JjCommitsAhead,
	JjDiffHunk,
	JjFileChange,
	JjFileLines,
	JjLogResult,
	JjMergeResult,
	JjRebaseResult,
	JjRevisionDiff,
	MergeStrategy,
	PullWorkspaceResult,
	RepoStatus,
	RenameWorkspaceResult,
	SingleRebaseResult,
	Workspace,
	WorkspacePartialStatus,
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

export const getRepoStatus = (repoPath: string): Promise<RepoStatus> =>
	invoke("get_repo_status", { repoPath });

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
): Promise<string | null> =>
	invoke("get_repo_setting", { repoPath, key });

export const setRepoSetting = (
	repoPath: string,
	key: string,
	value: string,
): Promise<void> =>
	invoke("set_repo_setting", { repoPath, key, value });

export const setWindowRepoPath = (repoPath: string): Promise<void> =>
	invoke("set_window_repo_path", { repoPath });

export const getWindowRepoPath = (): Promise<string | null> =>
	invoke("get_window_repo_path");

export const detectEditorApps = (): Promise<EditorAppsResponse> =>
	invoke("detect_editor_apps");

// JJ Workspace API
export const jjCreateWorkspace = (
	...args: [
		repoPath: string,
		workspaceName: string,
		branch: string,
		newBranch: boolean,
		sourceBranch?: string,
	]
): Promise<string> => {
	const [repoPath, workspaceName, branch, newBranch, sourceBranch] = args;
	return invoke("jj_create_workspace", {
		repoPath,
		workspaceName,
		branch,
		newBranch,
		sourceBranch: sourceBranch ?? null,
	});
};

// JJ Diff API
export const getWorkspaceChangedFiles = (
	repoPath: string,
	workspaceId: number | null,
): Promise<JjFileChange[]> =>
	invoke("get_workspace_changed_files", { repoPath, workspaceId });

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
	const [repoPath, workspaceId, filePath, fromParent, startLine, endLine] = args;
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
	const [repoPath, workspaceId, includeTargetBranchHistory, targetBranchLimit, limit] =
		args;
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

export const listConflictedFiles = (
	workspacePath: string,
): Promise<string[]> =>
	invoke("list_conflicted_files", { workspacePath });

export const jjGetBranches = (repoPath: string): Promise<JjBranch[]> =>
	invoke("jj_get_branches", { repoPath });

export const listRepoBranches = (repoPath: string): Promise<JjBranch[]> =>
	invoke("list_repo_branches", { repoPath });

export const jjEditBookmark = (
	repoPath: string,
	bookmarkName: string,
): Promise<string> =>
	invoke("jj_edit_bookmark", {
		repoPath,
		bookmarkName,
	});

export const switchRepoBranch = (
	repoPath: string,
	bookmarkName: string,
): Promise<string> =>
	invoke("switch_repo_branch", {
		repoPath,
		bookmarkName,
	});

export const jjTrackWorkspaceBookmarks = (
	repoPath: string,
): Promise<BookmarkTrackingResult> =>
	invoke("jj_track_workspace_bookmarks", { repoPath });

export const jjPush = (workspacePath: string): Promise<string> =>
	invoke("jj_push", { workspacePath });

export interface SyncStatus {
	ahead: number;
	behind: number;
}

export const jjGetSyncStatus = (
	workspacePath: string,
	branchName: string,
	notOnRemote: boolean = false,
): Promise<[number, number]> =>
	invoke("jj_get_sync_status", {
		workspacePath,
		branchName,
		notOnRemote,
	});

export const jjGitFetch = (repoPath: string): Promise<string> =>
	invoke("jj_git_fetch", { repoPath });

export const jjGitFetchBackground = (repoPath: string): Promise<void> =>
	invoke("jj_git_fetch_background", { repoPath });

export const jjPull = (workspacePath: string): Promise<string> =>
	invoke("jj_pull", { workspacePath });

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

export const jjGetLog = (
	...args: [
		workspacePath: string,
		targetBranch: string,
		isHomeRepo?: boolean,
		limit?: number,
	]
): Promise<JjLogResult> => {
	const [workspacePath, targetBranch, isHomeRepo, limit] = args;
	return invoke("jj_get_log", {
		workspacePath,
		targetBranch,
		isHomeRepo: isHomeRepo ?? null,
		limit: limit ?? null,
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

export const jjCreateMerge = (
	...args: [
		workspacePath: string,
		workspaceBranch: string,
		targetBranch: string,
		message: string,
	]
): Promise<JjMergeResult> => {
	const [workspacePath, workspaceBranch, targetBranch, message] = args;
	return invoke("jj_create_merge", {
		workspacePath,
		workspaceBranch,
		targetBranch,
		message,
	});
};

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
	const [repoPath, workspaceId, branchName, intent, filePaths, commitIds, mode, position] =
		args;
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
	return invoke("merge_workspace", { repoPath, workspaceId, message, mergeStrategy });
};

export const updateWorkspaceNotOnRemote = (
	repoPath: string,
	workspaceId: number,
	notOnRemote: boolean,
): Promise<void> =>
	invoke("update_workspace_not_on_remote", {
		repoPath,
		workspaceId,
		notOnRemote,
	});

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
): Promise<WorkspacePartialStatus[]> =>
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

// Alias for tests
export const jjSetWorkspaceTarget = (
	workspacePath: string,
	targetBranch: string,
): Promise<void> =>
	invoke("set_workspace_target_branch", {
		workspacePath,
		targetBranch,
	});

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
