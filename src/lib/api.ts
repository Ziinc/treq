import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import type { PlanHistoryEntry, PlanHistoryPayload } from "../types/planHistory";

export interface Worktree {
  id: number;
  repo_path: string;
  worktree_path: string;
  branch_name: string;
  created_at: string;
  metadata?: string;
  is_pinned: boolean;
}

export interface Session {
  id: number;
  worktree_id: number | null;
  name: string;
  created_at: string;
  last_accessed: string;
  plan_title?: string;
  model?: string | null;
}

export interface Command {
  id: number;
  worktree_id: number;
  command: string;
  created_at: string;
  status: string;
  output?: string;
}

export interface GitCacheEntry {
  id: number;
  worktree_path: string;
  file_path: string | null;
  cache_type: string;
  data: string;
  updated_at: string;
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

export interface WorktreeInfo {
  path: string;
  branch: string;
  commit: string;
}

export interface DirectoryEntry {
  name: string;
  path: string;
  is_directory: boolean;
}

// Database API
export const getWorktrees = (repo_path: string): Promise<Worktree[]> =>
  invoke("get_worktrees", { repoPath: repo_path });

export const rebuildWorktrees = (repo_path: string): Promise<Worktree[]> =>
  invoke("rebuild_worktrees", { repoPath: repo_path });

export const addWorktreeToDb = (
  repo_path: string,
  worktree_path: string,
  branch_name: string,
  metadata?: string
): Promise<number> =>
  invoke("add_worktree_to_db", { repoPath: repo_path, worktreePath: worktree_path, branchName: branch_name, metadata });

export const deleteWorktreeFromDb = (repo_path: string, id: number): Promise<void> =>
  invoke("delete_worktree_from_db", { repoPath: repo_path, id });

export const toggleWorktreePin = (repo_path: string, id: number): Promise<boolean> =>
  invoke("toggle_worktree_pin", { repoPath: repo_path, id });

export const getCommands = (worktree_id: number): Promise<Command[]> =>
  invoke("get_commands", { worktreeId: worktree_id });

export const addCommand = (
  worktree_id: number,
  command: string,
  status: string,
  output?: string
): Promise<number> =>
  invoke("add_command", { worktreeId: worktree_id, command, status, output });

export const getSetting = (key: string): Promise<string | null> =>
  invoke("get_setting", { key });

export const setSetting = (key: string, value: string): Promise<void> =>
  invoke("set_setting", { key, value });

export const getRepoSetting = (repo_path: string, key: string): Promise<string | null> =>
  invoke("get_repo_setting", { repoPath: repo_path, key });

export const setRepoSetting = (repo_path: string, key: string, value: string): Promise<void> =>
  invoke("set_repo_setting", { repoPath: repo_path, key, value });

export const deleteRepoSetting = (repo_path: string, key: string): Promise<void> =>
  invoke("delete_repo_setting", { repoPath: repo_path, key });

export const getGitCache = (
  worktree_path: string,
  cache_type: "changed_files" | "file_hunks",
  file_path?: string
): Promise<GitCacheEntry | null> =>
  invoke("get_git_cache", {
    worktreePath: worktree_path,
    cacheType: cache_type,
    ...(file_path ? { filePath: file_path } : {}),
  });

export const setGitCache = (
  worktree_path: string,
  cache_type: "changed_files" | "file_hunks",
  data: unknown,
  file_path?: string
): Promise<void> => {
  const serialized = typeof data === "string" ? data : JSON.stringify(data);
  return invoke("set_git_cache", {
    worktreePath: worktree_path,
    cacheType: cache_type,
    data: serialized,
    ...(file_path ? { filePath: file_path } : {}),
  });
};

export const invalidateGitCache = (worktree_path: string): Promise<void> =>
  invoke("invalidate_git_cache", { worktreePath: worktree_path });

export const preloadWorktreeGitData = (worktree_path: string): Promise<void> =>
  invoke("preload_worktree_git_data", { worktreePath: worktree_path });

// Git API
export const gitCreateWorktree = (
  repo_path: string,
  branch: string,
  new_branch: boolean,
  source_branch?: string
): Promise<string> =>
  invoke("git_create_worktree", {
    repoPath: repo_path,
    branch,
    newBranch: new_branch,
    sourceBranch: source_branch ?? null,
  });

export const gitGetCurrentBranch = (repo_path: string): Promise<string> =>
  invoke("git_get_current_branch", { repoPath: repo_path });

export const gitExecutePostCreateCommand = (worktree_path: string, command: string): Promise<string> =>
  invoke("git_execute_post_create_command", { worktreePath: worktree_path, command });

export const gitListWorktrees = (repo_path: string): Promise<WorktreeInfo[]> =>
  invoke("git_list_worktrees", { repoPath: repo_path });

export const gitRemoveWorktree = (repo_path: string, worktree_path: string): Promise<string> =>
  invoke("git_remove_worktree", { repoPath: repo_path, worktreePath: worktree_path });

export const gitGetStatus = (worktree_path: string): Promise<GitStatus> =>
  invoke("git_get_status", { worktreePath: worktree_path });

export const gitGetBranchInfo = (worktree_path: string): Promise<BranchInfo> =>
  invoke("git_get_branch_info", { worktreePath: worktree_path });

export const gitGetBranchDivergence = (
  worktree_path: string,
  base_branch: string
): Promise<BranchDivergence> =>
  invoke("git_get_branch_divergence", { worktreePath: worktree_path, baseBranch: base_branch });

export const gitGetFileDiff = (worktree_path: string, file_path: string): Promise<string> =>
  invoke("git_get_file_diff", { worktreePath: worktree_path, filePath: file_path });

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

export const gitGetFileHunks = (worktree_path: string, file_path: string): Promise<GitDiffHunk[]> =>
  invoke("git_get_file_hunks", { worktreePath: worktree_path, filePath: file_path });

export const gitGetFileLines = (
  worktreePath: string,
  filePath: string,
  isStaged: boolean,
  startLine: number,
  endLine: number
): Promise<FileLines> =>
  invoke("git_get_file_lines", {
    worktreePath,
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

export const gitListBranches = (repo_path: string): Promise<string[]> =>
  invoke("git_list_branches", { repoPath: repo_path });

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

export const gitDiscardAllChanges = (worktree_path: string): Promise<string> =>
  invoke("git_discard_all_changes", { worktreePath: worktree_path });

export const gitDiscardFiles = (worktree_path: string, file_paths: string[]): Promise<string> =>
  invoke("git_discard_files", { worktreePath: worktree_path, filePaths: file_paths });

export const gitHasUncommittedChanges = (worktree_path: string): Promise<boolean> =>
  invoke("git_has_uncommitted_changes", { worktreePath: worktree_path });

export const gitStashPushFiles = (
  worktree_path: string,
  file_paths: string[],
  message: string
): Promise<string> =>
  invoke("git_stash_push_files", { worktreePath: worktree_path, filePaths: file_paths, message });

export const gitStashPop = (worktree_path: string): Promise<string> =>
  invoke("git_stash_pop", { worktreePath: worktree_path });

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

// Shell API
export const shellExecute = (command: string, working_dir?: string): Promise<string> =>
  invoke("shell_execute", { command, workingDir: working_dir });

// Editor launching using CLI commands
export type EditorType = "vscode" | "cursor" | "zed";

export const openEditor = async (editor: EditorType, path: string): Promise<void> => {
  const editorCommands: Record<EditorType, string> = {
    vscode: "code",
    cursor: "cursor",
    zed: "zed",
  };
  
  const editorCommand = editorCommands[editor];
  await openPath(path, editorCommand);
};

// Git Operations API
export const gitCommit = (worktree_path: string, message: string): Promise<string> =>
  invoke("git_commit", { worktreePath: worktree_path, message });

export const gitCommitAmend = (worktree_path: string, message: string): Promise<string> =>
  invoke("git_commit_amend", { worktreePath: worktree_path, message });

export const gitAddAll = (worktree_path: string): Promise<string> =>
  invoke("git_add_all", { worktreePath: worktree_path });

export const gitUnstageAll = (worktree_path: string): Promise<string> =>
  invoke("git_unstage_all", { worktreePath: worktree_path });

export const gitPush = (worktree_path: string): Promise<string> =>
  invoke("git_push", { worktreePath: worktree_path });

export const gitPushForce = (worktree_path: string): Promise<string> =>
  invoke("git_push_force", { worktreePath: worktree_path });

export const gitPull = (worktree_path: string): Promise<string> =>
  invoke("git_pull", { worktreePath: worktree_path });

export const gitFetch = (worktree_path: string): Promise<string> =>
  invoke("git_fetch", { worktreePath: worktree_path });

export const gitLog = (worktree_path: string, count: number): Promise<string[]> =>
  invoke("git_log", { worktreePath: worktree_path, count });

export const gitStageFile = (worktree_path: string, file_path: string): Promise<string> =>
  invoke("git_stage_file", { worktreePath: worktree_path, filePath: file_path });

export const gitUnstageFile = (worktree_path: string, file_path: string): Promise<string> =>
  invoke("git_unstage_file", { worktreePath: worktree_path, filePath: file_path });

export const gitStageHunk = (worktree_path: string, patch: string): Promise<string> =>
  invoke("git_stage_hunk", { worktreePath: worktree_path, patch });

export const gitUnstageHunk = (worktree_path: string, patch: string): Promise<string> =>
  invoke("git_unstage_hunk", { worktreePath: worktree_path, patch });

export const gitGetChangedFiles = (worktree_path: string): Promise<string[]> =>
  invoke("git_get_changed_files", { worktreePath: worktree_path });

// Line selection type for staging individual lines
export interface LineSelectionPayload {
  hunk_index: number;
  line_index: number;
  content: string;
}

export const gitStageSelectedLines = (
  worktree_path: string,
  file_path: string,
  selections: LineSelectionPayload[],
  metadata_lines: string[],
  hunks: [string, string[]][]
): Promise<string> =>
  invoke("git_stage_selected_lines", {
    worktreePath: worktree_path,
    filePath: file_path,
    selections,
    metadataLines: metadata_lines,
    hunks,
  });

export const gitUnstageSelectedLines = (
  worktree_path: string,
  file_path: string,
  selections: LineSelectionPayload[],
  metadata_lines: string[],
  hunks: [string, string[]][]
): Promise<string> =>
  invoke("git_unstage_selected_lines", {
    worktreePath: worktree_path,
    filePath: file_path,
    selections,
    metadataLines: metadata_lines,
    hunks,
  });

// Calculate directory size (in bytes, excluding .git)
export const calculateDirectorySize = (path: string): Promise<number> =>
  invoke("calculate_directory_size", { path });

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

// Plan persistence (legacy - database-based)
export const savePlanToRepo = async (
  repoPath: string,
  planId: string,
  content: string,
  sessionId?: string
): Promise<void> => {
  const data = JSON.stringify({
    content,
    editedAt: new Date().toISOString(),
    sessionId: sessionId || null,
  });
  // Include sessionId in the key for session scoping
  const key = sessionId ? `plan_${sessionId}_${planId}` : `plan_${planId}`;
  return setRepoSetting(repoPath, key, data);
};

export const loadPlanFromRepo = async (
  repoPath: string,
  planId: string,
  sessionId?: string
): Promise<{ content: string; editedAt: string; sessionId?: string } | null> => {
  // Try session-scoped key first, then fallback to legacy key
  const sessionKey = sessionId ? `plan_${sessionId}_${planId}` : null;
  const legacyKey = `plan_${planId}`;
  
  let data: string | null = null;
  if (sessionKey) {
    data = await getRepoSetting(repoPath, sessionKey);
  }
  
  // Fallback to legacy key if session-scoped key not found
  if (!data) {
    data = await getRepoSetting(repoPath, legacyKey);
  }
  
  if (!data) return null;
  
  try {
    return JSON.parse(data);
  } catch (error) {
    console.error('Failed to parse plan data:', error);
    return null;
  }
};

export const clearSessionPlans = async (
  _repoPath: string,
  _sessionId: string
): Promise<void> => {
  // Get all repo settings and filter for this session's plans
  // Note: This requires backend support, but for now we'll delete known keys
  // The backend would need to implement a listRepoSettings function for full cleanup
  // For now, we'll rely on the session-scoped keys being automatically ignored
  // when loading plans with a different sessionId
};

// Plan history (.treq/local.db)
export const saveExecutedPlan = (
  repoPath: string,
  worktreeId: number,
  planData: PlanHistoryPayload
): Promise<number> =>
  invoke("save_executed_plan_command", { repoPath, worktreeId, planData });

export const getWorktreePlans = (
  repoPath: string,
  worktreeId: number,
  limit?: number
): Promise<PlanHistoryEntry[]> =>
  invoke("get_worktree_plans_command", {
    repoPath,
    worktreeId,
    ...(typeof limit === "number" ? { limit } : {}),
  });

export const getAllWorktreePlans = (
  repoPath: string,
  worktreeId: number
): Promise<PlanHistoryEntry[]> =>
  invoke("get_all_worktree_plans_command", { repoPath, worktreeId });

// File-based plan storage (.treq/plans/*)
export interface PlanMetadata {
  id: string;
  title: string;
  plan_type: string;
  worktree_id?: number;
  worktree_path?: string;
  branch_name?: string;
  timestamp: string;
}

export interface PlanFile {
  id: string;
  title: string;
  type: string;
  raw_markdown: string;
  worktree_id?: number;
  worktree_path?: string;
  branch_name?: string;
  timestamp: string;
}

export const savePlanToFile = (
  repoPath: string,
  planId: string,
  content: string,
  metadata: PlanMetadata
): Promise<void> =>
  invoke("save_plan_to_file", { repoPath, planId, content, metadata });

export const loadPlansFromFiles = (repoPath: string): Promise<PlanFile[]> =>
  invoke("load_plans_from_files", { repoPath });

export const getPlanFile = (repoPath: string, planId: string): Promise<PlanFile> =>
  invoke("get_plan_file", { repoPath, planId });

export const deletePlanFile = (repoPath: string, planId: string): Promise<void> =>
  invoke("delete_plan_file", { repoPath, planId });

// Session management API
export const createSession = (
  repo_path: string,
  worktreeId: number | null,
  name: string,
  planTitle?: string
): Promise<number> =>
  invoke("create_session", { repoPath: repo_path, worktreeId, name, planTitle });

export const getSessions = (repo_path: string): Promise<Session[]> =>
  invoke("get_sessions", { repoPath: repo_path });

export const getSessionsByWorktree = (repo_path: string, worktreeId: number): Promise<Session[]> =>
  invoke("get_sessions_by_worktree", { repoPath: repo_path, worktreeId });

export const getMainRepoSessions = (repo_path: string): Promise<Session[]> =>
  invoke("get_main_repo_sessions", { repoPath: repo_path });

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
  worktree_path: string;
  file_path: string;
  viewed_at: string;
  content_hash: string;
}

export const markFileViewed = (
  worktreePath: string,
  filePath: string,
  contentHash: string
): Promise<void> =>
  invoke("mark_file_viewed", { worktreePath, filePath, contentHash });

export const unmarkFileViewed = (
  worktreePath: string,
  filePath: string
): Promise<void> =>
  invoke("unmark_file_viewed", { worktreePath, filePath });

export const getViewedFiles = (worktreePath: string): Promise<FileView[]> =>
  invoke("get_viewed_files", { worktreePath });

export const clearAllViewedFiles = (worktreePath: string): Promise<void> =>
  invoke("clear_all_viewed_files", { worktreePath });
