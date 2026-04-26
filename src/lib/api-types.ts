export interface Workspace {
	id: number;
	repo_path: string;
	workspace_name: string;
	workspace_path: string;
	branch_name: string;
	created_at: string;
	metadata?: string;
	target_branch?: string | null;
	not_on_remote: boolean;
}

export type RemoteSyncStatus =
	| { type: "NotOnRemote" }
	| { type: "InSync" }
	| { type: "Ahead"; data: { count: number } }
	| { type: "Behind"; data: { count: number } }
	| { type: "Diverged"; data: { ahead: number; behind: number } };

export interface WorkspacePartialStatus {
	current: Workspace;
	has_conflicts: boolean;
	has_changes: boolean;
	commits_ahead: number;
}

export interface WorkspaceNode {
	status: WorkspacePartialStatus;
	parent_id: number | null;
	child_ids: number[];
	depth: number;
}

export interface WorkspaceStatus {
	current: Workspace;
	has_conflicts: boolean;
	has_changes: boolean;
	remote_sync: RemoteSyncStatus;
	target: Workspace | null;
	children: Workspace[];
	dag_nodes: WorkspaceNode[];
	conflicted_workspace_ids: number[];
	commits_ahead_of_target: {
		hash: string;
		timestamp: string;
		message: string;
	}[];
}

export interface RepoStatus {
	current_branch: string;
	default_branch: string;
	has_changes: boolean;
	has_conflicts: boolean;
	remote_sync: RemoteSyncStatus;
	fetch_error: string | null;
}

export interface Session {
	id: number;
	workspace_id: number | null;
	name: string;
	created_at: string;
	last_accessed: string;
	model?: string | null;
}

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
}

export interface BookmarkConflictCommit {
	commit_id: string;
	short_commit_id: string;
	change_id: string;
	description: string;
	author_name: string;
	timestamp: string;
	diff_summary: string;
}

export interface WorkspaceBookmarkConflict {
	workspace_id: number;
	workspace_name: string;
	workspace_path: string;
	branch_name: string;
	bookmark: string;
	commits: BookmarkConflictCommit[];
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
	is_immutable: boolean;
	insertions: number;
	deletions: number;
}

export interface JjLogResult {
	commits: JjLogCommit[];
	target_branch: string;
	workspace_branch: string;
	target_branch_commits?: JjLogCommit[];
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

export type MergeStrategy = "merge" | "squash" | "rebase";

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

export interface EditorAppsResponse {
	cursor: boolean;
	vscode: boolean;
	zed: boolean;
}

export interface JjBranch {
	name: string;
	is_current: boolean;
}

export interface BookmarkTrackingResult {
	tracked: string[];
	failed: [string, string][];
	already_tracked: string[];
}

export interface PullWorkspaceResult {
	success: boolean;
	message: string;
	was_diverged: boolean;
	commits_rebased: number;
}

export interface BranchStatus {
	local_exists: boolean;
	remote_exists: boolean;
	remote_name?: string;
	remote_ref?: string;
}

export interface RenameWorkspaceResult {
	success: boolean;
	message: string;
	workspace: Workspace | null;
	updated_children_ids: number[];
}

export interface SingleRebaseResult {
	rebased: boolean;
	success: boolean;
	message: string;
	bookmark_conflicts?: WorkspaceBookmarkConflict[];
}

export interface FileView {
	id: number;
	workspace_path: string;
	file_path: string;
	viewed_at: string;
	content_hash: string;
}

export interface DiffCacheEntry {
	data: string;
	timestamp: number;
}

export interface BranchDiffLine {
	kind: "context" | "addition" | "deletion";
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

export interface LineComment {
	id: string;
	file_path: string;
	hunk_id: string;
	start_line: number;
	end_line: number;
	line_content: string[];
	text: string;
	created_at: string;
	line_side?: "old" | "new";
}

export interface PendingReview {
	id: number;
	workspace_id: number;
	comments: LineComment[];
	viewed_files: string[];
	summary_text: string | null;
	created_at: string;
	updated_at: string;
}

export interface ConflictRegion {
	id: string;
	file_path: string;
	conflict_number: number;
	total_conflicts: number;
	start_line: number;
	end_line: number;
	content: string;
	marker_style: "jj" | "git";
}
