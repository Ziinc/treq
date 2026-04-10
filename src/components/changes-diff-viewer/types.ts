import type { JjDiffHunk, JjFileChange, LineComment as ApiLineComment } from "../../lib/api";
import type { ParsedFileChange } from "../../lib/git-utils";
import type { useToast } from "../ui/toast";

export interface ChangesDiffViewerProps {
	workspacePath: string;
	repoPath?: string;
	workspaceId?: number;
	readOnly?: boolean;
	onStagedFilesChange?: (files: string[]) => void;
	onChangedFilesChange?: (files: ParsedFileChange[]) => void;
	onRefreshingChange?: (isRefreshing: boolean) => void;
	initialSelectedFile: string | null;
	onReviewSubmitted?: () => void;
	onCreateAgentWithReview?: (
		reviewMarkdown: string,
		mode: "plan" | "acceptEdits",
	) => Promise<void>;
	conflictedFiles?: string[];
	showCommittedChanges?: boolean;
	onMoveFilesToNewWorkspace?: (files: string[]) => void;
}

export interface ChangesDiffViewerHandle {
	focusCommitInput: () => void;
	refresh: () => void;
}

export interface LineComment {
	id: string;
	filePath: string;
	hunkId: string;
	startLine: number;
	endLine: number;
	lineContent: string[];
	text: string;
	createdAt: string;
	lineSide?: "old" | "new";
}

export interface ConflictComment {
	id: string;
	conflictId: string;
	filePath: string;
	conflictNumber: number;
	text: string;
	createdAt: string;
}

export interface DiffLineSelection {
	filePath: string;
	lines: Array<{
		hunkIndex: number;
		lineIndex: number;
		content: string;
		isStaged: boolean;
	}>;
}

export interface FileHunksData {
	filePath: string;
	hunks: JjDiffHunk[];
	isLoading: boolean;
	error?: string;
}

export interface DiffSearchData {
	matches: Array<{
		filePath: string;
		hunkIndex: number;
		lineIndex: number;
		matchIndexInLine: number;
	}>;
	matchesByKey: Map<string, { firstGlobalIndex: number; count: number }>;
}

export interface PendingComment {
	filePath: string;
	hunkId: string;
	displayAtLineIndex: number;
	startLine: number;
	endLine: number;
	lineContent: string[];
	lineSide: "old" | "new";
}

export interface CommitInputHandle {
	focus: () => void;
}

export interface CommitInputProps {
	onCommit: (message: string) => void;
	disabled: boolean;
	pending: boolean;
	selectedFileCount?: number;
	totalFileCount?: number;
}

export interface HighlightedLineProps {
	content: string;
	language: string | null;
	searchQuery?: string;
	searchHighlightOffset?: number;
}

export interface FileRowComponentProps {
	file: ParsedFileChange;
	allFileHunks: Map<string, FileHunksData>;
	collapsedFiles: Set<string>;
	viewedFiles: Map<string, { viewedAt: string; contentHash: string }>;
	expandedLargeDiffs: Set<string>;
	diffFontSize: number;
	readOnly: boolean;
	fileActionTarget: string | null;
	selectedUnstagedFiles: Set<string>;
	workspacePath: string;
	toggleFileCollapse: (filePath: string) => void;
	toggleLargeDiff: (filePath: string) => void;
	handleMarkFileViewed: (filePath: string) => void;
	handleUnmarkFileViewed: (filePath: string) => void;
	handleDiscardFiles: (filePath: string) => void;
	handleContextMenu: (e: React.MouseEvent) => void;
	renderHunkLines: (
		hunk: JjDiffHunk,
		hunkIndex: number,
		filePath: string,
	) => JSX.Element;
	addToast: ReturnType<typeof useToast>["addToast"];
	getOutdatedCommentsForFile: (filePath: string) => LineComment[];
	deleteComment: (commentId: string) => void;
}

export type { ApiLineComment, JjFileChange };
