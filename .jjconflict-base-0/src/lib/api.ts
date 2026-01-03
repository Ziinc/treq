import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";

export interface Workspace {
  id: number;
  repo_path: string;
  workspace_name: string;
  workspace_path: string;
  branch_name: string;
  created_at: string;
  metadata?: string;
  target_branch?: string | null;
  has_conflicts: boolean;
}

export interface Session {
  id: number;
  workspace_id: number | null;
  name: string;
  created_at: string;
  last_accessed: string;
  model?: string | null;
}

export interface WorkspaceInfo {
  name: string;
  path: string;
  branch: string;
  is_colocated: boolean;
}

// JJ Diff Types (no staging concept - working copy only)
export interface JjDiffHunk {
  id: string;
  header: string;
  lines: string[];
  patch: string;
}

export interface JjFileChange {
  path: string;
  status: string;
  previous_path?: string | null;
}

export interface JjFileLines {
  lines: string[];
  start_line: number;
  end_line: number;
}

export interface JjRebaseResult {
  success: boolean;
  message: string;
  has_conflicts: boolean;
  conflicted_files: string[];
}

export interface JjLogCommit {
  commit_id: string;
  short_id: string;
  change_id: string;
  description: string;
  author_name: string;
  timestamp: string;
  parent_ids: string[];
  is_working_copy: boolean;
  bookmarks: string[];
  insertions: number;
  deletions: number;
}

export interface JjLogResult {
  commits: JjLogCommit[];
  target_branch: string;
  workspace_branch: string;
}

export interface JjCommitsAhead {
  commits: JjLogCommit[];
  total_count: number;
}

export interface JjMergeResult {
  success: boolean;
  message: string;
  has_conflicts: boolean;
  conflicted_files: string[];
  merge_commit_id: string | null;
}

export interface JjFileDiff {
  path: string;
  hunks: JjDiffHunk[];
}

export interface JjRevisionDiff {
  files: JjFileChange[];
  hunks_by_file: JjFileDiff[];
}

export interface DirectoryEntry {
  name: string;
  path: string;
  is_directory: boolean;
}

export interface CachedDirectoryEntry {
  name: string;
  path: string;
  is_directory: boolean;
  relative_path: string;
}

export interface FileSearchResult {
  file_path: string;
  relative_path: string;
}

// Database API
export const getWorkspaces = (repo_path: string): Promise<Workspace[]> =>
  invoke("get_workspaces", { repoPath: repo_path });

export const rebuildWorkspaces = (repo_path: string): Promise<Workspace[]> =>
  invoke("rebuild_workspaces", { repoPath: repo_path });

export const addWorkspaceToDb = (
  repo_path: string,
  workspace_name: string,
  workspace_path: string,
  branch_name: string,
  metadata?: string
): Promise<number> =>
  invoke("add_workspace_to_db", { repoPath: repo_path, workspaceName: workspace_name, workspacePath: workspace_path, branchName: branch_name, metadata });

export const createWorkspace = (
  repo_path: string,
  branch_name: string,
  new_branch: boolean,
  source_branch?: string,
  metadata?: string
): Promise<number> =>
  invoke("create_workspace", {
    repoPath: repo_path,
    branchName: branch_name,
    newBranch: new_branch,
    sourceBranch: source_branch ?? null,
    metadata: metadata ?? null,
  });

export const deleteWorkspaceFromDb = (repo_path: string, id: number): Promise<void> =>
  invoke("delete_workspace_from_db", { repoPath: repo_path, id });

export const deleteWorkspace = (
  repo_path: string,
  workspace_path: string,
  id: number
): Promise<void> =>
  invoke("delete_workspace", {
    repoPath: repo_path,
    workspacePath: workspace_path,
    id,
  });

export const cleanupStaleWorkspaces = (repo_path: string): Promise<void> =>
  invoke("cleanup_stale_workspaces", { repoPath: repo_path });

export const ensureWorkspaceIndexed = (
  repo_path: string,
  workspace_id: number | null,
  workspace_path: string
): Promise<boolean> =>
  invoke("ensure_workspace_indexed", {
    repoPath: repo_path,
    workspaceId: workspace_id,
    workspacePath: workspace_path,
  });

export const getSetting = (key: string): Promise<string | null> =>
  invoke("get_setting", { key });

export const getSettingsBatch = (keys: string[]): Promise<Record<string, string | null>> =>
  invoke("get_settings_batch", { keys });

export const setSetting = (key: string, value: string): Promise<void> =>
  invoke("set_setting", { key, value });

export const getRepoSetting = (repo_path: string, key: string): Promise<string | null> =>
  invoke("get_repo_setting", { repoPath: repo_path, key });

export const setRepoSetting = (repo_path: string, key: string, value: string): Promise<void> =>
  invoke("set_repo_setting", { repoPath: repo_path, key, value });

// JJ Workspace API
export const jjCreateWorkspace = (
  repo_path: string,
  workspace_name: string,
  branch: string,
  new_branch: boolean,
  source_branch?: string
): Promise<string> =>
  invoke("jj_create_workspace", {
    repoPath: repo_path,
    workspaceName: workspace_name,
    branch,
    newBranch: new_branch,
    sourceBranch: source_branch ?? null,
  });

export const jjRemoveWorkspace = (repo_path: string, workspace_path: string): Promise<void> =>
  invoke("jj_remove_workspace", { repoPath: repo_path, workspacePath: workspace_path });

export const jjSquashToWorkspace = (
  source_workspace_path: string,
  target_workspace_name: string,
  file_paths?: string[]
): Promise<string> =>
  invoke("jj_squash_to_workspace", {
    sourceWorkspacePath: source_workspace_path,
    targetWorkspaceName: target_workspace_name,
    filePaths: file_paths || null,
  });

// JJ Diff API
export const jjGetChangedFiles = (workspace_path: string): Promise<JjFileChange[]> =>
  invoke("jj_get_changed_files", { workspacePath: workspace_path });

export const jjGetFileHunks = (
  workspace_path: string,
  file_path: string
): Promise<JjDiffHunk[]> =>
  invoke("jj_get_file_hunks", {
    workspacePath: workspace_path,
    filePath: file_path,
  });

export const jjGetFileLines = (
  workspacePath: string,
  filePath: string,
  fromParent: boolean,
  startLine: number,
  endLine: number
): Promise<JjFileLines> =>
  invoke("jj_get_file_lines", {
    workspacePath,
    filePath,
    fromParent,
    startLine,
    endLine,
  });

export const jjRestoreFile = (
  workspace_path: string,
  file_path: string
): Promise<string> =>
  invoke("jj_restore_file", {
    workspacePath: workspace_path,
    filePath: file_path,
  });

export const jjRestoreAll = (workspace_path: string): Promise<string> =>
  invoke("jj_restore_all", { workspacePath: workspace_path });

export const jjIsWorkspace = (repo_path: string): Promise<boolean> =>
  invoke("jj_is_workspace", { repoPath: repo_path });

export const jjCommit = (
  workspace_path: string,
  message: string
): Promise<string> =>
  invoke("jj_commit", {
    workspacePath: workspace_path,
    message,
  });

export const jjSplit = (
  workspace_path: string,
  message: string,
  file_paths: string[]
): Promise<string> =>
  invoke("jj_split", {
    workspacePath: workspace_path,
    message,
    filePaths: file_paths,
  });

export const jjRebaseOnto = (
  workspace_path: string,
  target_branch: string
): Promise<JjRebaseResult> =>
  invoke("jj_rebase_onto", {
    workspacePath: workspace_path,
    targetBranch: target_branch,
  });

export const jjGetConflictedFiles = (
  workspace_path: string
): Promise<string[]> =>
  invoke("jj_get_conflicted_files", { workspacePath: workspace_path });

export const jjGetDefaultBranch = (repo_path: string): Promise<string> =>
  invoke("jj_get_default_branch", { repoPath: repo_path });

export interface JjBranch {
  name: string;
  is_current: boolean;
}

export const jjGetBranches = (repo_path: string): Promise<JjBranch[]> =>
  invoke("jj_get_branches", { repoPath: repo_path });

export const jjPush = (workspace_path: string): Promise<string> =>
  invoke("jj_push", { workspacePath: workspace_path });

export const jjGitFetch = (repo_path: string): Promise<string> =>
  invoke("jj_git_fetch", { repoPath: repo_path });

export const jjGitFetchBackground = (repo_path: string): Promise<void> =>
  invoke("jj_git_fetch_background", { repoPath: repo_path });

export const jjPull = (workspace_path: string): Promise<string> =>
  invoke("jj_pull", { workspacePath: workspace_path });

export interface BranchStatus {
  local_exists: boolean;
  remote_exists: boolean;
  remote_name?: string;  // The remote name (e.g., "origin") if remote exists
  remote_ref?: string;   // Full remote ref (e.g., "origin/branch") if remote exists
}

export const checkBranchExists = (
  repo_path: string,
  branch_name: string
): Promise<BranchStatus> =>
  invoke("jj_check_branch_exists", { repoPath: repo_path, branchName: branch_name });

export const jjGetLog = (
  workspacePath: string,
  targetBranch: string
): Promise<JjLogResult> =>
  invoke("jj_get_log", { workspacePath, targetBranch });

export const jjInit = (repo_path: string): Promise<string> =>
  invoke("jj_init", { repoPath: repo_path });

export const jjGetCommitsAhead = (
  workspacePath: string,
  targetBranch: string
): Promise<JjCommitsAhead> =>
  invoke("jj_get_commits_ahead", { workspacePath, targetBranch });

export const jjGetMergeDiff = (
  workspacePath: string,
  targetBranch: string
): Promise<JjRevisionDiff> =>
  invoke("jj_get_merge_diff", { workspacePath, targetBranch });

export const jjCreateMerge = (
  workspacePath: string,
  targetBranch: string,
  message: string
): Promise<JjMergeResult> =>
  invoke("jj_create_merge", { workspacePath, targetBranch, message });

export const updateWorkspaceMetadata = (
  repo_path: string,
  id: number,
  metadata: string
): Promise<void> =>
  invoke("update_workspace_metadata", {
    repoPath: repo_path,
    id,
    metadata,
  });

export const updateWorkspaceConflicts = (
  repo_path: string,
  workspace_id: number,
  has_conflicts: boolean
): Promise<void> =>
  invoke("update_workspace_conflicts", {
    repoPath: repo_path,
    workspaceId: workspace_id,
    hasConflicts: has_conflicts,
  });

export const setWorkspaceTargetBranch = (
  repo_path: string,
  workspace_path: string,
  id: number,
  target_branch: string
): Promise<JjRebaseResult> =>
  invoke("set_workspace_target_branch", {
    repoPath: repo_path,
    workspacePath: workspace_path,
    id,
    targetBranch: target_branch,
  });

// Alias for tests
export const jjSetWorkspaceTarget = (
  workspace_path: string,
  target_branch: string
): Promise<void> =>
  invoke("set_workspace_target_branch", {
    workspacePath: workspace_path,
    targetBranch: target_branch,
  });

export interface SingleRebaseResult {
  rebased: boolean;
  success: boolean;
  has_conflicts: boolean;
  conflicted_files: string[];
  message: string;
}

export const checkAndRebaseWorkspaces = (
  repo_path: string,
  workspace_id?: number | null,
  default_branch?: string | null,
  force?: boolean
): Promise<SingleRebaseResult> =>
  invoke("check_and_rebase_workspaces", {
    repoPath: repo_path,
    workspaceId: workspace_id ?? null,
    defaultBranch: default_branch ?? null,
    force: force ?? null,
  });

// PTY API
export const ptyCreateSession = (
  session_id: string,
  working_dir?: string,
  shell?: string,
  initial_command?: string
): Promise<void> =>
  invoke("pty_create_session", { sessionId: session_id, workingDir: working_dir, shell, initialCommand: initial_command });

export const ptyWrite = (session_id: string, data: string): Promise<void> =>
  invoke("pty_write", { sessionId: session_id, data });

export const ptyResize = (session_id: string, rows: number, cols: number): Promise<void> =>
  invoke("pty_resize", { sessionId: session_id, rows, cols });

export const ptyClose = (session_id: string): Promise<void> =>
  invoke("pty_close", { sessionId: session_id });

export const ptySessionExists = (session_id: string): Promise<boolean> =>
  invoke("pty_session_exists", { sessionId: session_id });

export const ptyListen = (session_id: string, callback: (data: string) => void) =>
  listen<string>(`pty-data-${session_id}`, (event) => callback(event.payload));

// File System API
export const readFile = (path: string): Promise<string> =>
  invoke("read_file", { path });

export const listDirectory = (path: string): Promise<DirectoryEntry[]> =>
  invoke("list_directory", { path });

export const listDirectoryCached = (
  repoPath: string,
  workspaceId: number | null,
  parentPath: string
): Promise<CachedDirectoryEntry[]> =>
  invoke("list_directory_cached", {
    repoPath,
    workspaceId,
    parentPath,
  });

export const searchWorkspaceFiles = (
  repoPath: string,
  workspaceId: number | null,
  query: string,
  limit?: number
): Promise<FileSearchResult[]> =>
  invoke("search_workspace_files", {
    repoPath,
    workspaceId,
    query,
    limit: limit ?? 50,
  });

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
  repo_path: string,
  workspaceId: number | null,
  name: string
): Promise<number> =>
  invoke("create_session", { repoPath: repo_path, workspaceId, name });

export const getSessions = (repo_path: string): Promise<Session[]> =>
  invoke("get_sessions", { repoPath: repo_path });

export const updateSessionAccess = (repo_path: string, id: number): Promise<void> =>
  invoke("update_session_access", { repoPath: repo_path, id });

export const updateSessionName = (repo_path: string, id: number, name: string): Promise<void> =>
  invoke("update_session_name", { repoPath: repo_path, id, name });

export const deleteSession = (repo_path: string, id: number): Promise<void> =>
  invoke("delete_session", { repoPath: repo_path, id });

export const getSessionModel = (repo_path: string, id: number): Promise<string | null> =>
  invoke("get_session_model", { repoPath: repo_path, id });

export const setSessionModel = (repo_path: string, id: number, model: string | null): Promise<void> =>
  invoke("set_session_model", { repoPath: repo_path, id, model });

// File view tracking API
export interface FileView {
  id: number;
  workspace_path: string;
  file_path: string;
  viewed_at: string;
  content_hash: string;
}

export const markFileViewed = (
  workspacePath: string,
  filePath: string,
  contentHash: string
): Promise<void> =>
  invoke("mark_file_viewed", { workspacePath, filePath, contentHash });

export const unmarkFileViewed = (
  workspacePath: string,
  filePath: string
): Promise<void> =>
  invoke("unmark_file_viewed", { workspacePath, filePath });

export const getViewedFiles = (workspacePath: string): Promise<FileView[]> =>
  invoke("get_viewed_files", { workspacePath });

export const clearAllViewedFiles = (workspacePath: string): Promise<void> =>
  invoke("clear_all_viewed_files", { workspacePath });

// Git remotes API (stub - backend not implemented)
export const gitListRemotes = (_repoPath: string): Promise<string[]> =>
  Promise.resolve(["origin"]);

// Diff cache API (in-memory stub implementation)
const diffCache = new Map<string, { data: string; timestamp: number }>();

export interface DiffCacheEntry {
  data: string;
  timestamp: number;
}

export const getDiffCache = async (
  workspacePath: string,
  cacheType: string,
  filePath?: string
): Promise<DiffCacheEntry | null> => {
  const key = filePath
    ? `${workspacePath}:${cacheType}:${filePath}`
    : `${workspacePath}:${cacheType}`;
  return diffCache.get(key) ?? null;
};

export const setDiffCache = async (
  workspacePath: string,
  cacheType: string,
  data: unknown,
  filePath?: string
): Promise<void> => {
  const key = filePath
    ? `${workspacePath}:${cacheType}:${filePath}`
    : `${workspacePath}:${cacheType}`;
  diffCache.set(key, {
    data: typeof data === "string" ? data : JSON.stringify(data),
    timestamp: Date.now(),
  });
};

// Branch diff types for merge review
export type DiffLineKind = "context" | "addition" | "deletion";

export interface BranchDiffLine {
  kind: DiffLineKind;
  old_line?: number | null;
  new_line?: number | null;
  content: string;
}

export interface BranchDiffFileDiff {
  path: string;
  lines: BranchDiffLine[];
}

export interface BranchDiffFileChange {
  path: string;
  status: string;
}

export interface BranchCommitInfo {
  hash: string;
  abbreviated_hash: string;
  message: string;
  author_name: string;
  author_email: string;
  timestamp: string;
}

// Branch diff functions (stub implementations - backend not yet implemented)
export const gitGetChangedFilesBetweenBranches = (
  _repoPath: string,
  _baseBranch: string,
  _headBranch: string
): Promise<BranchDiffFileChange[]> =>
  Promise.resolve([]);

export const gitGetDiffBetweenBranches = (
  _repoPath: string,
  _baseBranch: string,
  _headBranch: string
): Promise<BranchDiffFileDiff[]> =>
  Promise.resolve([]);

export const gitGetCommitsBetweenBranches = (
  _repoPath: string,
  _baseBranch: string,
  _headBranch: string,
  _limit?: number
): Promise<BranchCommitInfo[]> =>
  Promise.resolve([]);

// Load pending review comments (stub implementation)
export interface PendingReviewComment {
  id: string;
  filePath: string;
  hunkId: string;
  startLine: number;
  endLine: number;
  lineContent: string[];
  text: string;
  createdAt: string;
}

export const loadPendingReview = (
  _repoPath: string,
  _workspaceId: number
): Promise<PendingReviewComment[]> =>
  Promise.resolve([]);

// Clear pending review data (stub implementation)
export const clearPendingReview = (
  _repoPath: string,
  _workspaceId: number
): Promise<void> =>
  Promise.resolve();

// File Watcher API
export const startFileWatcher = (
  workspaceId: number,
  workspacePath: string
): Promise<void> => invoke("start_file_watcher", { workspaceId, workspacePath });

export const stopFileWatcher = (
  workspaceId: number,
  workspacePath: string
): Promise<void> => invoke("stop_file_watcher", { workspaceId, workspacePath });
