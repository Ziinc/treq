import React, { memo, useMemo } from "react";
import { ChevronDown, ChevronRight, FileText, Loader2, X } from "lucide-react";
import { Button } from "../ui/button";
import { CommentInput } from "../CommentInput";
import { FileCommentSection } from "./FileCommentSection";
import { FileRowHeader } from "./FileRowHeader";
import { GithubCommentCard } from "./GithubCommentCard";
import { buildQuotedPendingComment, getQuoteProp } from "./utils";
import { highlightCode } from "../../lib/syntax-highlight";
import { highlightInHtml } from "../../lib/text-search";
import { isBinaryFile } from "../../lib/git-utils";
import {
	FILE_COMMENT_HUNK_ID,
	type FileRowComponentProps,
	type HighlightedLineProps,
} from "./types";

const HighlightedLine: React.FC<HighlightedLineProps> = memo(
	({ content, language, searchQuery, searchHighlightOffset }) => {
		const html = useMemo(() => {
			let result = highlightCode(content, language);
			if (searchQuery) {
				const { html: highlighted } = highlightInHtml(
					result,
					searchQuery,
					searchHighlightOffset ?? -1,
				);
				result = highlighted;
			}
			return result;
		}, [content, language, searchQuery, searchHighlightOffset]);
		return <span dangerouslySetInnerHTML={{ __html: html }} />;
	},
);
HighlightedLine.displayName = "HighlightedLine";

const FileRowComponent: React.FC<FileRowComponentProps> = memo((props) => {
	const {
		file,
		allFileHunks,
		overrideFileHunks,
		collapsedFiles,
		viewedFiles,
		expandedLargeDiffs,
		diffFontSize,
		readOnly,
		fileActionTarget,
		selectedUnstagedFiles,
		actualConflictedFiles,
		workspacePath,
		toggleFileCollapse,
		toggleLargeDiff,
		handleMarkFileViewed,
		handleUnmarkFileViewed,
		handleDiscardFiles,
		handleContextMenu,
		renderHunkLines,
		addToast,
		getOutdatedCommentsForFile,
		getFileCommentsForFile,
		deleteComment,
		getUnplacedThreadsForFile,
		collapsedThreadIds,
		toggleThreadCollapse,
		expandedOutdatedGroups,
		toggleOutdatedGroup,
		showCommentInput,
		pendingComment,
		editingCommentId,
		setPendingComment,
		setShowCommentInput,
		addComment,
		cancelComment,
		startEditComment,
		cancelEditComment,
		saveEditComment,
	} = props;

	const filePath = file.path;
	const fileData = (overrideFileHunks ?? allFileHunks).get(filePath);
	if (!fileData) return <div />;

	const isRename = !!file.oldPath;
	const fileComments = getFileCommentsForFile(filePath);
	const showFileCommentInputHere =
		showCommentInput &&
		pendingComment?.filePath === filePath &&
		pendingComment.hunkId === FILE_COMMENT_HUNK_ID;
	const hasFileCommentActivity =
		fileComments.length > 0 || showFileCommentInputHere;
	const isCollapsed = hasFileCommentActivity
		? false
		: isBinaryFile(filePath) || isRename
			? true
			: collapsedFiles.has(filePath);
	const isViewed = viewedFiles.has(filePath);
	const fileId = `file-section-${filePath.replace(/[^a-zA-Z0-9]/g, "-")}`;
	const isConflictedFile = actualConflictedFiles.includes(filePath);

	let additions = 0;
	let deletions = 0;
	if (!fileData.isLoading && fileData.hunks) {
		for (const hunk of fileData.hunks) {
			for (const line of hunk.lines) {
				if (line.startsWith("+")) additions++;
				else if (line.startsWith("-")) deletions++;
			}
		}
	}

	const outdatedComments = getOutdatedCommentsForFile(filePath);
	const unplacedGithubThreads = getUnplacedThreadsForFile(filePath);
	const outdatedGroupExpanded = expandedOutdatedGroups.has(filePath);

	return (
		<>
			<div
				key={filePath}
				id={fileId}
				data-file-path={filePath}
				className="border border-border rounded-lg overflow-hidden"
				style={{ fontSize: `${diffFontSize}px` }}
			>
				<FileRowHeader
					file={file}
					filePath={filePath}
					isCollapsed={isCollapsed}
					isRename={isRename}
					isViewed={isViewed}
					additions={additions}
					deletions={deletions}
					readOnly={readOnly}
					fileActionTarget={fileActionTarget}
					selectedUnstagedFiles={selectedUnstagedFiles}
					workspacePath={workspacePath}
					toggleFileCollapse={toggleFileCollapse}
					handleMarkFileViewed={handleMarkFileViewed}
					handleUnmarkFileViewed={handleUnmarkFileViewed}
					handleDiscardFiles={handleDiscardFiles}
					addToast={addToast}
					onAddFileComment={() => {
						if (collapsedFiles.has(filePath)) {
							toggleFileCollapse(filePath);
						}
						setPendingComment({
							filePath,
							hunkId: FILE_COMMENT_HUNK_ID,
							displayAtLineIndex: -1,
							startLine: 0,
							endLine: 0,
							lineContent: [],
							lineSide: "new",
						});
						setShowCommentInput(true);
					}}
				/>

				{!isCollapsed && (
					<div
						className="bg-background font-mono text-sm"
						onContextMenu={handleContextMenu}
					>
						{hasFileCommentActivity && (
							<FileCommentSection
								comments={fileComments}
								editingCommentId={editingCommentId}
								showInput={showFileCommentInputHere}
								onSubmit={addComment}
								onCancel={cancelComment}
								onStartEdit={startEditComment}
								onCancelEdit={cancelEditComment}
								onSaveEdit={saveEditComment}
								onDelete={deleteComment}
							/>
						)}
						{isBinaryFile(filePath) ? (
							<div className="flex items-center justify-center py-[32px] text-muted-foreground">
								<FileText className="w-5 h-5 mr-[8px] opacity-50" />
								<span>Binary file - no diff available</span>
							</div>
						) : fileData.isLoading ? (
							<div className="flex items-center justify-center py-[32px] text-muted-foreground">
								<Loader2 className="w-5 h-5 animate-spin mr-[8px]" />
								Loading diff...
							</div>
						) : fileData.error ? (
							<div className="text-sm text-destructive px-[12px] py-[8px]">
								{fileData.error}
							</div>
						) : fileData.hunks.length === 0 ? (
							<div className="text-sm text-muted-foreground px-[12px] py-[24px] text-center">
								{isConflictedFile
									? "No diff available for this conflicted file (possibly deleted)"
									: "No diff hunks available"}
							</div>
						) : additions + deletions > 250 &&
							!expandedLargeDiffs.has(filePath) ? (
							<div className="flex items-center justify-center gap-[12px] h-20 text-muted-foreground">
								<FileText className="w-5 h-5 opacity-50" />
								<span className="text-sm">
									Large diff ({additions + deletions} lines)
								</span>
								<Button
									variant="outline"
									size="sm"
									onClick={() => toggleLargeDiff(filePath)}
								>
									View changes
								</Button>
							</div>
						) : (
							<>
								{unplacedGithubThreads.length > 0 && (
									<div className="border-b border-sky-500/40 bg-sky-500/5">
										<button
											className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-sky-500/10"
											onClick={() => toggleOutdatedGroup(filePath)}
											data-testid="github-outdated-group-toggle"
										>
											{outdatedGroupExpanded ? (
												<ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" />
											) : (
												<ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
											)}
											<span className="text-xs text-muted-foreground font-sans">
												{unplacedGithubThreads.length} outdated comment
												{unplacedGithubThreads.length !== 1 ? "s" : ""} (no
												longer on a visible line)
											</span>
										</button>
										{outdatedGroupExpanded && (
											<div className="px-4 pb-3 space-y-3">
												{unplacedGithubThreads.map((thread) => (
													<GithubCommentCard
														key={thread.id}
														thread={thread}
														collapsed={collapsedThreadIds.has(thread.id)}
														onToggleCollapse={() =>
															toggleThreadCollapse(thread.id)
														}
														onQuote={(quote) => {
															setPendingComment(
																buildQuotedPendingComment(
																	{
																		filePath,
																		hunkId: "",
																		displayAtLineIndex: -1,
																		lineNumber: thread.line ?? 0,
																		lineSide: "new",
																	},
																	quote,
																),
															);
															setShowCommentInput(true);
														}}
													/>
												))}
												{showCommentInput &&
													pendingComment &&
													pendingComment.filePath === filePath &&
													pendingComment.hunkId === "" && (
														<CommentInput
															onSubmit={addComment}
															onCancel={cancelComment}
															filePath={pendingComment.filePath}
															startLine={pendingComment.startLine}
															endLine={pendingComment.endLine}
															quote={getQuoteProp(pendingComment)}
														/>
													)}
											</div>
										)}
									</div>
								)}

								{outdatedComments.length > 0 && (
									<div className="border-b border-amber-500/40 bg-amber-500/5 px-4 py-3 space-y-3">
										{outdatedComments.map((comment) => (
											<div
												key={comment.id}
												className="bg-background rounded-md p-3 border border-amber-500/30"
											>
												<div className="flex items-center justify-between mb-2">
													<div className="flex items-center gap-2">
														<span className="px-1.5 py-0.5 rounded bg-amber-500/25 text-amber-700 dark:text-amber-300 text-[10px] font-medium">
															Outdated
														</span>
														<span className="text-xs text-muted-foreground">
															Line{" "}
															{comment.startLine === comment.endLine
																? comment.startLine
																: `${comment.startLine}-${comment.endLine}`}
														</span>
													</div>
													<button
														onClick={() => deleteComment(comment.id)}
														className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
														title="Delete"
													>
														<X className="w-3 h-3" />
													</button>
												</div>
												{comment.lineContent.length > 0 && (
													<pre className="bg-muted/60 rounded px-2 py-1 text-xs mb-2 whitespace-pre-wrap overflow-auto font-mono">
														{comment.lineContent.join("\n")}
													</pre>
												)}
												<p className="font-sans">{comment.text}</p>
											</div>
										))}
									</div>
								)}

								{fileData.hunks.map((hunk, hunkIndex) =>
									renderHunkLines(hunk, hunkIndex, filePath),
								)}
							</>
						)}
					</div>
				)}
			</div>
		</>
	);
});
FileRowComponent.displayName = "FileRowComponent";

export { FileRowComponent, HighlightedLine };
