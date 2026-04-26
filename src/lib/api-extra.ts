import type {
	CachedDirectoryEntry,
	ConflictRegion,
	DiffCacheEntry,
	DirectoryEntry,
	FileSearchResult,
	LineComment,
	PendingReview,
	Session,
} from "./api-types";

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";

export const ptyCreateSession = (
	...args: [
		sessionId: string,
		workingDir?: string,
		shell?: string,
		initialCommand?: string,
		suppressEchoFor?: string,
	]
): Promise<void> => {
	const [sessionId, workingDir, shell, initialCommand, suppressEchoFor] = args;
	return invoke("pty_create_session", {
		sessionId,
		workingDir,
		shell,
		initialCommand,
		suppressEchoFor,
	});
};

export const ptyWrite = (sessionId: string, data: string): Promise<void> =>
	invoke("pty_write", { sessionId, data });

export const ptyWriteSuppressEcho = (
	sessionId: string,
	data: string,
): Promise<void> => invoke("pty_write_suppress_echo", { sessionId, data });

export const ptyResize = (
	sessionId: string,
	rows: number,
	cols: number,
): Promise<void> => invoke("pty_resize", { sessionId, rows, cols });

export const ptyClose = (sessionId: string): Promise<void> =>
	invoke("pty_close", { sessionId });

export const ptySessionExists = (sessionId: string): Promise<boolean> =>
	invoke("pty_session_exists", { sessionId });

export const ptyListen = (
	sessionId: string,
	callback: (data: string) => void,
) =>
	listen<string>(`pty-data-${sessionId}`, (event) => callback(event.payload));

// File System API
export const readFile = (path: string): Promise<string> =>
	invoke("read_file", { path });

export const listDirectory = (path: string): Promise<DirectoryEntry[]> =>
	invoke("list_directory", { path });

export const listDirectoryCached = (
	repoPath: string,
	workspaceId: number | null,
	parentPath: string,
): Promise<CachedDirectoryEntry[]> =>
	invoke("list_directory_cached", {
		repoPath,
		workspaceId,
		parentPath,
	});

export const searchWorkspaceFiles = (
	...args: [
		repoPath: string,
		workspaceId: number | null,
		query: string,
		limit?: number,
	]
): Promise<FileSearchResult[]> => {
	const [repoPath, workspaceId, query, limit] = args;
	return invoke("search_workspace_files", {
		repoPath,
		workspaceId,
		query,
		limit: limit ?? 50,
	});
};

// Folder picker
export const selectFolder = async (): Promise<string | null> => {
	const selected = await open({
		directory: true,
		multiple: false,
		title: "Select Folder",
	});
	return selected;
};

// Session management API
export const createSession = (
	repoPath: string,
	workspaceId: number | null,
	name: string,
): Promise<number> => invoke("create_session", { repoPath, workspaceId, name });

export const getSessions = (repoPath: string): Promise<Session[]> =>
	invoke("get_sessions", { repoPath });

export const updateSessionAccess = (
	repoPath: string,
	id: number,
): Promise<void> => invoke("update_session_access", { repoPath, id });

export const getSessionModel = (
	repoPath: string,
	id: number,
): Promise<string | null> => invoke("get_session_model", { repoPath, id });

export const setSessionModel = (
	repoPath: string,
	id: number,
	model: string | null,
): Promise<void> => invoke("set_session_model", { repoPath, id, model });

export const markFileViewed = (
	workspacePath: string,
	filePath: string,
	contentHash: string,
): Promise<void> =>
	invoke("mark_file_viewed", { workspacePath, filePath, contentHash });

export const unmarkFileViewed = (
	workspacePath: string,
	filePath: string,
): Promise<void> => invoke("unmark_file_viewed", { workspacePath, filePath });

// Diff cache API (in-memory stub implementation)
const diffCache = new Map<string, { data: string; timestamp: number }>();

export const getDiffCache = async (
	...args: [workspacePath: string, cacheType: string, filePath?: string]
): Promise<DiffCacheEntry | null> => {
	const [workspacePath, cacheType, filePath] = args;
	const key = filePath
		? `${workspacePath}:${cacheType}:${filePath}`
		: `${workspacePath}:${cacheType}`;
	return diffCache.get(key) ?? null;
};

export const loadPendingReview = (
	repoPath: string,
	workspaceId: number,
): Promise<PendingReview | null> => {
	void repoPath;
	void workspaceId;
	return Promise.resolve(null);
};

export const savePendingReview = (
	...args: [
		repoPath: string,
		workspaceId: number,
		comments: LineComment[],
		viewedFiles?: string[],
		summaryText?: string,
	]
): Promise<number> => {
	const [repoPath, workspaceId, comments, viewedFiles, summaryText] = args;
	return invoke("save_pending_review", {
		repoPath,
		workspaceId,
		comments: JSON.stringify(comments),
		viewedFiles: viewedFiles ? JSON.stringify(viewedFiles) : null,
		summaryText: summaryText ?? null,
	});
};

export const clearPendingReview = (
	repoPath: string,
	workspaceId: number,
): Promise<void> => invoke("clear_pending_review", { repoPath, workspaceId });

// File Watcher API
export const startFileWatcher = (
	workspaceId: number,
	workspacePath: string,
): Promise<void> =>
	invoke("start_file_watcher", { workspaceId, workspacePath });

export const stopFileWatcher = (
	workspaceId: number,
	workspacePath: string,
): Promise<void> => invoke("stop_file_watcher", { workspaceId, workspacePath });

export const parseConflictMarkers = (
	content: string,
	filePath: string,
): Promise<ConflictRegion[]> =>
	invoke("parse_conflict_markers", { content, filePath });

export const moveCommitToExistingWorkspace = (
	...args: [
		repoPath: string,
		sourceWorkspaceId: number,
		commitChangeId: string,
		targetWorkspaceId: number,
	]
): Promise<void> => {
	const [repoPath, sourceWorkspaceId, commitChangeId, targetWorkspaceId] = args;
	return invoke("move_commit_to_existing_workspace", {
		repoPath,
		sourceWorkspaceId,
		commitChangeId,
		targetWorkspaceId,
	});
};

export const abandonCommit = (
	repoPath: string,
	workspaceId: number,
	commitChangeId: string,
): Promise<void> =>
	invoke("abandon_commit", {
		repoPath,
		workspaceId,
		commitChangeId,
	});

export const getTreqBinDir = (): Promise<string> => invoke("get_treq_bin_dir");
