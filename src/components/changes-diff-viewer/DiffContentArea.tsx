import React, { Fragment, useCallback, useMemo } from "react";
import { CheckCircle2, FileText, Loader2 } from "lucide-react";
import type { ConflictRegion, JjDiffHunk, JjFileChange } from "../../lib/api";
import type { ParsedFileChange } from "../../lib/git-utils";
import { Button } from "../ui/button";
import { InlineConflictCard } from "../InlineConflictCard";
import { SearchOverlay } from "../SearchOverlay";
import { FileRowComponent } from "./FileRowComponent";
import { HunkLines } from "./HunkLines";
import type {
	CommentLineQuery,
	ConflictComment,
	DiffLinePointer,
	DiffLineSelection,
	DiffSearchData,
	FileHunksData,
	LineComment,
	LineMouseDownPayload,
	PendingComment,
} from "./types";
import type { useToast } from "../ui/toast";

interface DiffContentAreaProps {
	// search
	isSearchOpen: boolean;
	searchQuery: string;
	setSearchQuery: (q: string) => void;
	currentMatchIndex: number;
	setCurrentMatchIndex: React.Dispatch<React.SetStateAction<number>>;
	handleSearchNext: () => void;
	handleSearchPrevious: () => void;
	handleSearchClose: () => void;
	searchFocusTrigger: number;
	searchData: DiffSearchData;
	debouncedSearchQuery: string;
	// loading / data
	initialLoading: boolean;
	loadingAllHunks: boolean;
	files: ParsedFileChange[];
	allFileHunks: Map<string, FileHunksData>;
	committedFiles: JjFileChange[];
	showCommittedChanges: boolean | undefined;
	// large changeset
	largeChangesetExpanded: boolean;
	setLargeChangesetExpanded: React.Dispatch<React.SetStateAction<boolean>>;
	// conflicts
	actualConflictedFiles: string[];
	conflictRegionsByFile: Map<string, ConflictRegion[]>;
	conflictLineLookups: Map<string, Map<number, ConflictRegion>>;
	firstConflictRegionIdByFile: Map<string, string>;
	// comment / selection props forwarded to HunkLines
	expandedContext: Map<string, string[]>;
	conflictComments: Map<string, ConflictComment>;
	openConflictComments: Set<string>;
	editingConflictCommentId: string | null;
	diffLineSelection: DiffLineSelection | null;
	showCommentInput: boolean;
	pendingComment: PendingComment | null;
	editingCommentId: string | null;
	comments: LineComment[];
	conflictFileRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
	diffFontSize: number;
	handleExpandContext: (
		filePath: string,
		hunkIndex: number,
		direction: "before" | "after",
	) => void;
	handleLineMouseDown: (payload: LineMouseDownPayload) => void;
	handleLineMouseEnter: (line: DiffLinePointer) => void;
	handleLineMouseUp: () => void;
	handleAddCommentFromSelection: () => void;
	isLineSelected: (line: DiffLinePointer) => boolean;
	saveConflictComment: (args: {
		conflictId: string;
		filePath: string;
		conflictNumber: number;
		text: string;
	}) => void;
	clearConflictComment: (conflictId: string) => void;
	toggleConflictComment: (conflictId: string) => void;
	setOpenConflictComments: React.Dispatch<React.SetStateAction<Set<string>>>;
	startEditConflictComment: (commentId: string) => void;
	cancelEditConflictComment: () => void;
	saveEditConflictComment: (commentId: string, text: string) => void;
	addComment: (text: string) => void;
	cancelComment: () => void;
	deleteComment: (commentId: string) => void;
	startEditComment: (commentId: string) => void;
	cancelEditComment: () => void;
	saveEditComment: (commentId: string, text: string) => void;
	setPendingComment: React.Dispatch<
		React.SetStateAction<PendingComment | null>
	>;
	setShowCommentInput: React.Dispatch<React.SetStateAction<boolean>>;
	getCommentsForLine: (query: CommentLineQuery) => LineComment[];
	// file row props
	collapsedFiles: Set<string>;
	viewedFiles: Map<string, { viewedAt: string; contentHash: string }>;
	expandedLargeDiffs: Set<string>;
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
	addToast: ReturnType<typeof useToast>["addToast"];
	getOutdatedCommentsForFile: (filePath: string) => LineComment[];
	diffContainerRef: React.RefObject<HTMLDivElement>;
}

export function DiffContentArea({
	isSearchOpen,
	searchQuery,
	setSearchQuery,
	currentMatchIndex,
	setCurrentMatchIndex,
	handleSearchNext,
	handleSearchPrevious,
	handleSearchClose,
	searchFocusTrigger,
	searchData,
	debouncedSearchQuery,
	initialLoading,
	loadingAllHunks,
	files,
	allFileHunks,
	committedFiles,
	showCommittedChanges,
	largeChangesetExpanded,
	setLargeChangesetExpanded,
	actualConflictedFiles,
	conflictRegionsByFile,
	conflictLineLookups,
	firstConflictRegionIdByFile,
	expandedContext,
	conflictComments,
	openConflictComments,
	editingConflictCommentId,
	diffLineSelection,
	showCommentInput,
	pendingComment,
	editingCommentId,
	comments,
	conflictFileRefs,
	diffFontSize,
	handleExpandContext,
	handleLineMouseDown,
	handleLineMouseEnter,
	handleLineMouseUp,
	handleAddCommentFromSelection,
	isLineSelected,
	saveConflictComment,
	clearConflictComment,
	toggleConflictComment,
	setOpenConflictComments,
	startEditConflictComment,
	cancelEditConflictComment,
	saveEditConflictComment,
	addComment,
	cancelComment,
	deleteComment,
	startEditComment,
	cancelEditComment,
	saveEditComment,
	setPendingComment,
	setShowCommentInput,
	getCommentsForLine,
	collapsedFiles,
	viewedFiles,
	expandedLargeDiffs,
	readOnly,
	fileActionTarget,
	selectedUnstagedFiles,
	workspacePath,
	toggleFileCollapse,
	toggleLargeDiff,
	handleMarkFileViewed,
	handleUnmarkFileViewed,
	handleDiscardFiles,
	handleContextMenu,
	addToast,
	getOutdatedCommentsForFile,
	diffContainerRef,
}: DiffContentAreaProps) {
	const hunkLinesProps = useMemo(
		() => ({
			conflictLineLookups,
			firstConflictRegionIdByFile,
			expandedContext,
			conflictComments,
			openConflictComments,
			editingConflictCommentId,
			searchData,
			debouncedSearchQuery,
			currentMatchIndex,
			diffLineSelection,
			showCommentInput,
			pendingComment,
			editingCommentId,
			comments,
			conflictFileRefs,
			diffFontSize,
			handleExpandContext,
			handleLineMouseDown,
			handleLineMouseEnter,
			handleLineMouseUp,
			handleAddCommentFromSelection,
			isLineSelected,
			saveConflictComment,
			clearConflictComment,
			toggleConflictComment,
			setOpenConflictComments,
			startEditConflictComment,
			cancelEditConflictComment,
			saveEditConflictComment,
			addComment,
			cancelComment,
			deleteComment,
			startEditComment,
			cancelEditComment,
			saveEditComment,
			setPendingComment,
			setShowCommentInput,
			getCommentsForLine,
		}),
		[
			conflictLineLookups,
			firstConflictRegionIdByFile,
			expandedContext,
			conflictComments,
			openConflictComments,
			editingConflictCommentId,
			searchData,
			debouncedSearchQuery,
			currentMatchIndex,
			diffLineSelection,
			showCommentInput,
			pendingComment,
			editingCommentId,
			comments,
			conflictFileRefs,
			diffFontSize,
			handleExpandContext,
			handleLineMouseDown,
			handleLineMouseEnter,
			handleLineMouseUp,
			handleAddCommentFromSelection,
			isLineSelected,
			saveConflictComment,
			clearConflictComment,
			toggleConflictComment,
			setOpenConflictComments,
			startEditConflictComment,
			cancelEditConflictComment,
			saveEditConflictComment,
			addComment,
			cancelComment,
			deleteComment,
			startEditComment,
			cancelEditComment,
			saveEditComment,
			setPendingComment,
			setShowCommentInput,
			getCommentsForLine,
		],
	);

	const renderHunkLines = useCallback(
		(hunk: JjDiffHunk, hunkIndex: number, fPath: string) => (
			<HunkLines
				key={`${fPath}:${hunkIndex}`}
				hunk={hunk}
				hunkIndex={hunkIndex}
				filePath={fPath}
				{...hunkLinesProps}
			/>
		),
		[hunkLinesProps],
	);

	return (
		<div className="flex-1 overflow-hidden relative">
			<SearchOverlay
				isVisible={isSearchOpen}
				query={searchQuery}
				onQueryChange={(q) => {
					setSearchQuery(q);
					setCurrentMatchIndex(0);
				}}
				onNext={handleSearchNext}
				onPrevious={handleSearchPrevious}
				onClose={handleSearchClose}
				currentMatch={searchData.matches.length > 0 ? currentMatchIndex + 1 : 0}
				totalMatches={searchData.matches.length}
				className="absolute top-2 right-2 z-20"
				focusTrigger={searchFocusTrigger}
			/>
			{initialLoading || loadingAllHunks ? (
				<div className="h-full flex items-center justify-center text-muted-foreground">
					<Loader2 className="w-6 h-6 animate-spin" />
					<span className="ml-2">Loading diffs...</span>
				</div>
			) : files.length === 0 &&
				!(showCommittedChanges && committedFiles.length > 0) ? (
				<div className="h-full flex flex-col items-center justify-center text-muted-foreground">
					<CheckCircle2 className="w-12 h-12 mb-3 text-muted-foreground/40" />
					<p className="text-sm">No changes to review</p>
				</div>
			) : (
				(() => {
					let totalLines = 0;
					for (const [, fileData] of allFileHunks) {
						if (!fileData.isLoading && fileData.hunks) {
							for (const hunk of fileData.hunks)
								totalLines += hunk.lines.length;
						}
					}
					if (totalLines > 1000 && !largeChangesetExpanded) {
						return (
							<div className="h-full flex flex-col items-center justify-center gap-4 text-muted-foreground">
								<FileText className="w-12 h-12 opacity-50" />
								<div className="text-center">
									<p className="font-medium mb-1">Large changeset</p>
									<p className="text-sm">
										{totalLines} lines across {files.length} file
										{files.length !== 1 ? "s" : ""}
									</p>
								</div>
								<Button
									variant="outline"
									onClick={() => setLargeChangesetExpanded(true)}
								>
									View changes
								</Button>
							</div>
						);
					}
					return (
						<div ref={diffContainerRef} className="h-full overflow-y-auto">
							<div className="p-4 space-y-4">
								{actualConflictedFiles.length > 0 && (
									<>
										{actualConflictedFiles.map((conflictFile) => {
											const regions = conflictRegionsByFile.get(conflictFile);
											if (!regions || regions.length === 0) return null;
											return (
												<div
													key={`conflict-${conflictFile}`}
													className="border border-destructive/30 rounded-md overflow-hidden"
												>
													<div className="bg-destructive/10 px-3 py-2 flex items-center gap-2">
														<span className="font-mono text-sm">
															{conflictFile}
														</span>
													</div>
													{regions.map((region, index) => (
														<Fragment key={region.id}>
															{index > 0 && (
																<div className="border-t border-border" />
															)}
															<InlineConflictCard
																region={region}
																conflictComments={conflictComments}
																openConflictComments={openConflictComments}
																editingConflictCommentId={
																	editingConflictCommentId
																}
																saveConflictComment={saveConflictComment}
																clearConflictComment={clearConflictComment}
																toggleConflictComment={toggleConflictComment}
																setOpenConflictComments={
																	setOpenConflictComments
																}
																startEditConflictComment={
																	startEditConflictComment
																}
																cancelEditConflictComment={
																	cancelEditConflictComment
																}
																saveEditConflictComment={
																	saveEditConflictComment
																}
																searchData={searchData}
																debouncedSearchQuery={debouncedSearchQuery}
																currentMatchIndex={currentMatchIndex}
																className="p-0"
															/>
														</Fragment>
													))}
												</div>
											);
										})}
									</>
								)}
								{files.map((file) => (
									<FileRowComponent
										key={file.path}
										file={file}
										allFileHunks={allFileHunks}
										collapsedFiles={collapsedFiles}
										viewedFiles={viewedFiles}
										expandedLargeDiffs={expandedLargeDiffs}
										diffFontSize={diffFontSize}
										readOnly={readOnly}
										fileActionTarget={fileActionTarget}
										selectedUnstagedFiles={selectedUnstagedFiles}
										workspacePath={workspacePath}
										toggleFileCollapse={toggleFileCollapse}
										toggleLargeDiff={toggleLargeDiff}
										handleMarkFileViewed={handleMarkFileViewed}
										handleUnmarkFileViewed={handleUnmarkFileViewed}
										handleDiscardFiles={handleDiscardFiles}
										handleContextMenu={handleContextMenu}
										renderHunkLines={renderHunkLines}
										addToast={addToast}
										getOutdatedCommentsForFile={getOutdatedCommentsForFile}
										deleteComment={deleteComment}
									/>
								))}
								{showCommittedChanges &&
									committedFiles.map((file) => (
										<FileRowComponent
											key={`committed-${file.path}`}
											file={
												{
													...file,
													stagedStatus: "",
													workspaceStatus: file.status,
													isUntracked: false,
												} as ParsedFileChange
											}
											allFileHunks={allFileHunks}
											collapsedFiles={collapsedFiles}
											viewedFiles={viewedFiles}
											expandedLargeDiffs={expandedLargeDiffs}
											diffFontSize={diffFontSize}
											readOnly={true}
											fileActionTarget={null}
											selectedUnstagedFiles={new Set()}
											workspacePath={workspacePath}
											toggleFileCollapse={toggleFileCollapse}
											toggleLargeDiff={toggleLargeDiff}
											handleMarkFileViewed={handleMarkFileViewed}
											handleUnmarkFileViewed={handleUnmarkFileViewed}
											handleDiscardFiles={handleDiscardFiles}
											handleContextMenu={handleContextMenu}
											renderHunkLines={renderHunkLines}
											addToast={addToast}
											getOutdatedCommentsForFile={() => []}
											deleteComment={deleteComment}
										/>
									))}
							</div>
						</div>
					);
				})()
			)}
		</div>
	);
}
