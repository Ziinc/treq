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
}

export interface Session {
  id: number;
  workspace_id: number | null;
  name: string;
  created_at: string;
  last_accessed: string;
  model?: string | null;
}

export interface GitCacheEntry {
  id: number;
  workspace_path: string;
  file_path: string | null;
  cache_type: string;
  data: string;
  updated_at: string;
}

export interface WorkspaceInfo {
  name: string;
  path: string;
  branch: string;
  is_colocated: boolean;
}

export interface GitStatus {
  modified: number;
  added: number;
  deleted: number;
  untracked: number;
}

export interface BranchInfo {
  name: string;
  ahead: number;
  behind: number;
  upstream?: string;
}

export interface BranchDivergence {
  ahead: number;
  behind: number;
}

export interface LineDiffStats {
  lines_added: number;
  lines_deleted: number;
}

export interface GitDiffHunk {
  id: string;
  header: string;
  lines: string[];
  is_staged: boolean;
  patch: string;
}

export interface FileLines {
  lines: string[];
  start_line: number;
  end_line: number;
}

// Cached git changes types
export interface CachedFileChange {
  id: number;
  workspace_id: number | null;
  file_path: string;
  staged_status: string | null;
  workspace_status: string | null;
  is_untracked: boolean;
  hunks_json: string | null;
  updated_at: string;
}

export interface WorkspaceChangesPayload {
  workspace_path: string;
  workspace_id: number | null;
}

// JJ Diff Types (no staging concept - working copy only)
export interface JjDiffHunk {
  id: string;
  header: string;
  lines: string[];
  patch: string;
  is_staged?: boolean; // Always false/undefined for JJ (for compatibility with existing code)
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

export type DiffLineKind = "context" | "addition" | "deletion" | "meta";

export interface BranchDiffLine {
  content: string;
  kind: DiffLineKind;
  old_line?: number | null;
  new_line?: number | null;
}

export interface BranchDiffHunk {
  header: string;
  lines: BranchDiffLine[];
}

export interface BranchDiffFileDiff {
  path: string;
  previous_path?: string | null;
  status: string;
  is_binary: boolean;
  binary_message?: string | null;
  metadata: string[];
  hunks: BranchDiffHunk[];
}

export interface BranchDiffFileChange {
  path: string;
  previous_path?: string | null;
  status: string;
}

export interface BranchCommitInfo {
  hash: string;
  abbreviated_hash: string;
  author_name: string;
  author_email: string;
  date: string;
  message: string;
}

export type MergeStrategy = "regular" | "squash" | "no_ff" | "ff_only";

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

export const deleteWorkspaceFromDb = (repo_path: string, id: number): Promise<void> =>
  invoke("delete_workspace_from_db", { repoPath: repo_path, id });

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

export const getGitCache = (
  workspace_path: string,
  cache_type: "changed_files" | "file_hunks",
  file_path?: string
): Promise<GitCacheEntry | null> =>
  invoke("get_git_cache", {
    workspacePath: workspace_path,
    cacheType: cache_type,
    ...(file_path ? { filePath: file_path } : {}),
  });

export const setGitCache = (
  workspace_path: string,
  cache_type: "changed_files" | "file_hunks",
  data: unknown,
  file_path?: string
): Promise<void> => {
  const serialized = typeof data === "string" ? data : JSON.stringify(data);
  return invoke("set_git_cache", {
    workspacePath: workspace_path,
    cacheType: cache_type,
    data: serialized,
    ...(file_path ? { filePath: file_path } : {}),
  });
};

export const invalidateGitCache = (workspace_path: string): Promise<void> =>
  invoke("invalidate_git_cache", { workspacePath: workspace_path });

export const preloadWorkspaceGitData = (workspace_path: string): Promise<void> =>
  invoke("preload_workspace_git_data", { workspacePath: workspace_path });

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

// Git API
export const gitGetCurrentBranch = (repo_path: string): Promise<string> =>
  invoke("git_get_current_branch", { repoPath: repo_path });

export const gitExecutePostCreateCommand = (
  workspace_path: string,
  command: string
): Promise<string> =>
  invoke("git_execute_post_create_command", {
    workspacePath: workspace_path,
    command,
  });

export const gitGetStatus = (workspace_path: string): Promise<GitStatus> =>
  invoke("git_get_status", { workspacePath: workspace_path });

export const gitGetBranchInfo = (workspace_path: string): Promise<BranchInfo> =>
  invoke("git_get_branch_info", { workspacePath: workspace_path });

export const gitGetBranchDivergence = (
  workspace_path: string,
  base_branch: string
): Promise<BranchDivergence> =>
  invoke("git_get_branch_divergence", { workspacePath: workspace_path, baseBranch: base_branch });

export const gitGetLineDiffStats = (
  workspace_path: string,
  base_branch: string
): Promise<LineDiffStats> =>
  invoke("git_get_line_diff_stats", { workspacePath: workspace_path, baseBranch: base_branch });

export interface WorkspaceGitInfo {
  status: GitStatus;
  branch_info: BranchInfo;
  divergence: BranchDivergence | null;
  line_diff_stats: LineDiffStats | null;
}

export const gitGetWorkspaceInfo = (
  workspace_path: string,
  base_branch?: string | null
): Promise<WorkspaceGitInfo> =>
  invoke("git_get_workspace_info", { workspacePath: workspace_path, baseBranch: base_branch });

export const gitGetDiffBetweenBranches = (
  repo_path: string,
  base_branch: string,
  head_branch: string
): Promise<BranchDiffFileDiff[]> =>
  invoke("git_get_diff_between_branches", { repoPath: repo_path, baseBranch: base_branch, headBranch: head_branch });

export const gitGetChangedFilesBetweenBranches = (
  repo_path: string,
  base_branch: string,
  head_branch: string
): Promise<BranchDiffFileChange[]> =>
  invoke("git_get_changed_files_between_branches", { repoPath: repo_path, baseBranch: base_branch, headBranch: head_branch });

export const gitGetCommitsBetweenBranches = (
  repo_path: string,
  base_branch: string,
  head_branch: string,
  limit?: number
): Promise<BranchCommitInfo[]> =>
  invoke("git_get_commits_between_branches", {
    repoPath: repo_path,
    baseBranch: base_branch,
    headBranch: head_branch,
    ...(typeof limit === "number" ? { limit } : {}),
  });

export const gitGetFileHunks = (workspace_path: string, file_path: string): Promise<GitDiffHunk[]> =>
  invoke("git_get_file_hunks", { workspacePath: workspace_path, filePath: file_path });

export const gitGetFileLines = (
  workspacePath: string,
  filePath: string,
  isStaged: boolean,
  startLine: number,
  endLine: number
): Promise<FileLines> =>
  invoke("git_get_file_lines", {
    workspacePath,
    filePath,
    isStaged,
    startLine,
    endLine,
  });

export interface BranchListItem {
  name: string;
  full_name: string;
  is_remote: boolean;
  is_current: boolean;
}

export const gitListBranchesDetailed = (repo_path: string): Promise<BranchListItem[]> =>
  invoke("git_list_branches_detailed", { repoPath: repo_path });

export const gitCheckoutBranch = (
  repo_path: string,
  branch_name: string,
  create_new: boolean = false
): Promise<string> =>
  invoke("git_checkout_branch", { repoPath: repo_path, branchName: branch_name, createNew: create_new });

export const gitListGitignoredFiles = (repo_path: string): Promise<string[]> =>
  invoke("git_list_gitignored_files", { repoPath: repo_path });

export const gitMerge = (
  repo_path: string,
  branch: string,
  strategy: MergeStrategy,
  commitMessage?: string
): Promise<string> =>
  invoke("git_merge", {
    repoPath: repo_path,
    branch,
    strategy,
    commitMessage: commitMessage && commitMessage.trim() ? commitMessage : undefined,
  });

export const gitDiscardAllChanges = (workspace_path: string): Promise<string> =>
  invoke("git_discard_all_changes", { workspacePath: workspace_path });

export const gitDiscardFiles = (workspace_path: string, file_paths: string[]): Promise<string> =>
  invoke("git_discard_files", { workspacePath: workspace_path, filePaths: file_paths });

export const gitHasUncommittedChanges = (workspace_path: string): Promise<boolean> =>
  invoke("git_has_uncommitted_changes", { workspacePath: workspace_path });

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

// Git Operations API
export const gitCommit = (workspace_path: string, message: string): Promise<string> =>
  invoke("git_commit", { workspacePath: workspace_path, message });

export const gitAddAll = (workspace_path: string): Promise<string> =>
  invoke("git_add_all", { workspacePath: workspace_path });

export const gitUnstageAll = (workspace_path: string): Promise<string> =>
  invoke("git_unstage_all", { workspacePath: workspace_path });

export const gitPush = (workspace_path: string): Promise<string> =>
  invoke("git_push", { workspacePath: workspace_path });

export const gitPushForce = (workspace_path: string): Promise<string> =>
  invoke("git_push_force", { workspacePath: workspace_path });

export const gitPull = (workspace_path: string): Promise<string> =>
  invoke("git_pull", { workspacePath: workspace_path });

export const gitFetch = (workspace_path: string): Promise<string> =>
  invoke("git_fetch", { workspacePath: workspace_path });

export const gitListRemotes = (workspace_path: string): Promise<string[]> =>
  invoke("git_list_remotes", { workspacePath: workspace_path });

export const gitStageFile = (workspace_path: string, file_path: string): Promise<string> =>
  invoke("git_stage_file", { workspacePath: workspace_path, filePath: file_path });

export const gitUnstageFile = (workspace_path: string, file_path: string): Promise<string> =>
  invoke("git_unstage_file", { workspacePath: workspace_path, filePath: file_path });

export const gitStageHunk = (workspace_path: string, patch: string): Promise<string> =>
  invoke("git_stage_hunk", { workspacePath: workspace_path, patch });

export const gitUnstageHunk = (workspace_path: string, patch: string): Promise<string> =>
  invoke("git_unstage_hunk", { workspacePath: workspace_path, patch });

export const gitGetChangedFiles = (workspace_path: string): Promise<string[]> =>
  invoke("git_get_changed_files", { workspacePath: workspace_path });

// Line selection type for staging individual lines
export interface LineSelectionPayload {
  hunk_index: number;
  line_index: number;
  content: string;
}

export const gitStageSelectedLines = (
  workspace_path: string,
  file_path: string,
  selections: LineSelectionPayload[],
  metadata_lines: string[],
  hunks: [string, string[]][]
): Promise<string> =>
  invoke("git_stage_selected_lines", {
    workspacePath: workspace_path,
    filePath: file_path,
    selections,
    metadataLines: metadata_lines,
    hunks,
  });

export const gitUnstageSelectedLines = (
  workspace_path: string,
  file_path: string,
  selections: LineSelectionPayload[],
  metadata_lines: string[],
  hunks: [string, string[]][]
): Promise<string> =>
  invoke("git_unstage_selected_lines", {
    workspacePath: workspace_path,
    filePath: file_path,
    selections,
    metadataLines: metadata_lines,
    hunks,
  });

// Cached git changes API
export const getCachedGitChanges = (
  repo_path: string,
  workspace_id: number | null
): Promise<CachedFileChange[]> =>
  invoke("get_cached_git_changes", { repoPath: repo_path, workspaceId: workspace_id });

export const startGitWatcher = (repo_path: string): Promise<void> =>
  invoke("start_git_watcher", { repoPath: repo_path });

export const stopGitWatcher = (repo_path: string): Promise<void> =>
  invoke("stop_git_watcher", { repoPath: repo_path });

export const triggerWorkspaceScan = (
  repo_path: string,
  workspace_id: number | null
): Promise<void> =>
  invoke("trigger_workspace_scan", { repoPath: repo_path, workspaceId: workspace_id });

export const listenWorkspaceChanges = (
  callback: (payload: WorkspaceChangesPayload) => void
) => listen<WorkspaceChangesPayload>("workspace-changes-updated", (event) => callback(event.payload));

// Folder picker and git validation
export const selectFolder = async (): Promise<string | null> => {
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Select Folder",
  });
  return selected;
};

export const isGitRepository = (path: string): Promise<boolean> =>
  invoke("git_is_repository", { path });

export const gitInit = (path: string): Promise<string> =>
  invoke("git_init_repo", { path });

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
