import React, { Fragment, memo } from "react";
import {
	ChevronDown,
	ChevronUp,
	MessageSquare,
	Pencil,
	Plus,
	X,
} from "lucide-react";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "../ui/tooltip";
import { cn } from "../../lib/utils";
import { getLanguageFromPath } from "../../lib/syntax-highlight";
import { CommentEditInput } from "../CommentEditInput";
import { CommentInput } from "../CommentInput";
import { InlineConflictCard } from "../InlineConflictCard";
import { HighlightedLine } from "./FileRowComponent";
import {
	computeHunkLineNumbers,
	getLinePrefix,
	getLineTypeClass,
	parseHunkHeader,
} from "./utils";
import type { HunkLinesProps } from "./types";

const HunkLines: React.FC<HunkLinesProps> = memo(
	({
		hunk,
		hunkIndex,
		filePath,
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
		conflictFileRefs,
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
	}) => {
		const lineNumbers = computeHunkLineNumbers(hunk);
		const language = getLanguageFromPath(filePath);
		const conflictLineMap = conflictLineLookups.get(filePath);
		const renderedConflictIds = new Set<string>();
		const firstConflictRegionId = firstConflictRegionIdByFile.get(filePath);

		return (
			<Fragment key={hunk.id}>
				{/* Hunk separator header */}
				<div
					className={cn("flex items-stretch font-mono text-sm", "bg-muted/60")}
				>
					<div className="w-24 flex-shrink-0 border-r border-border/40" />
					<div className="w-6 flex-shrink-0" />
					<div className="w-5 flex-shrink-0" />
					<div className="flex-1 flex items-center px-[8px] py-[2px]">
						<span className="text-muted-foreground truncate">
							{hunk.header}
						</span>
					</div>
				</div>

				{/* Expand above button */}
				{(() => {
					const beforeKey = `${filePath}:${hunkIndex}:before`;
					const beforeLines = expandedContext.get(beforeKey);
					const { newStart } = parseHunkHeader(hunk.header);
					const hasRoomAbove =
						newStart > 1 || (beforeLines && beforeLines.length > 0);
					return (
						<>
							{beforeLines &&
								beforeLines.length > 0 &&
								beforeLines.map((ctxLine, ctxIdx) => {
									const ctxLineNum = newStart - beforeLines.length + ctxIdx;
									return (
										<div
											key={`${beforeKey}-${ctxIdx}`}
											className="flex items-stretch font-mono text-sm"
										>
											<div className="w-24 flex-shrink-0 text-muted-foreground select-none border-r border-border/40 flex items-center">
												<span className="w-10 text-right text-sm mr-1">
													{ctxLineNum > 0 ? ctxLineNum : ""}
												</span>
												<span className="w-10 text-right text-sm">
													{ctxLineNum > 0 ? ctxLineNum : ""}
												</span>
											</div>
											<div className="w-6 flex-shrink-0" />
											<div className="w-5 flex-shrink-0 text-center select-none">
												{" "}
											</div>
											<div className="flex-1 px-[8px] py-[2px] whitespace-pre-wrap break-all text-muted-foreground">
												<HighlightedLine
													content={ctxLine || " "}
													language={language}
												/>
											</div>
										</div>
									);
								})}
							{hasRoomAbove && (
								<div
									className="flex items-stretch font-mono text-sm bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors"
									onClick={() =>
										handleExpandContext(filePath, hunkIndex, "before")
									}
								>
									<div className="w-24 flex-shrink-0 border-r border-border/40" />
									<div className="w-6 flex-shrink-0" />
									<div className="w-5 flex-shrink-0" />
									<div className="flex-1 flex items-center justify-center px-[8px] py-[2px] gap-1 text-muted-foreground text-xs">
										<ChevronUp className="w-3 h-3" />
										<span>Show more lines above</span>
									</div>
								</div>
							)}
						</>
					);
				})()}

				{/* Hunk lines */}
				{hunk.lines.map((line, lineIndex) => {
					const lineNum = lineNumbers[lineIndex];
					const newLineNumber = lineNum?.new;
					if (newLineNumber !== undefined && conflictLineMap) {
						const conflictRegion = conflictLineMap.get(newLineNumber);
						if (conflictRegion) {
							if (
								!renderedConflictIds.has(conflictRegion.id) &&
								conflictRegion.start_line === newLineNumber
							) {
								renderedConflictIds.add(conflictRegion.id);
								const shouldRegisterRef =
									firstConflictRegionId === conflictRegion.id;
								return (
									<InlineConflictCard
										key={`conflict-${conflictRegion.id}`}
										region={conflictRegion}
										conflictComments={conflictComments}
										openConflictComments={openConflictComments}
										editingConflictCommentId={editingConflictCommentId}
										saveConflictComment={saveConflictComment}
										clearConflictComment={clearConflictComment}
										toggleConflictComment={toggleConflictComment}
										setOpenConflictComments={setOpenConflictComments}
										startEditConflictComment={startEditConflictComment}
										cancelEditConflictComment={cancelEditConflictComment}
										saveEditConflictComment={saveEditConflictComment}
										searchData={searchData}
										debouncedSearchQuery={debouncedSearchQuery}
										currentMatchIndex={currentMatchIndex}
										className="bg-destructive/10 border-y border-destructive/40 px-[16px] py-[12px] space-y-2"
										registerFileRef={
											shouldRegisterRef
												? (el) => {
														if (el) {
															conflictFileRefs.current.set(filePath, el);
														} else {
															conflictFileRefs.current.delete(filePath);
														}
													}
												: undefined
										}
									/>
								);
							}
							return null;
						}
					}

					const actualLineNum = lineNum?.new ?? lineNum?.old ?? lineIndex + 1;
					const currentLineSide: "old" | "new" =
						lineNum?.old !== undefined && lineNum?.new === undefined
							? "old"
							: "new";
					const lineComments = getCommentsForLine({
						filePath,
						hunkId: hunk.id,
						lineNumber: actualLineNum,
						side: currentLineSide,
					});
					const showCommentInputHere =
						showCommentInput &&
						pendingComment &&
						pendingComment.filePath === filePath &&
						pendingComment.hunkId === hunk.id &&
						lineIndex === pendingComment.displayAtLineIndex;
					const selected = isLineSelected({
						filePath,
						hunkIndex,
						lineIndex,
					});

					const searchKey = `${filePath}:${hunkIndex}:${lineIndex}`;
					const searchLineData = searchData.matchesByKey.get(searchKey);
					let searchCurrentOffset = -1;
					if (searchLineData && debouncedSearchQuery) {
						const globalFirst = searchLineData.firstGlobalIndex;
						if (
							currentMatchIndex >= globalFirst &&
							currentMatchIndex < globalFirst + searchLineData.count
						) {
							searchCurrentOffset = currentMatchIndex - globalFirst;
						}
					}

					return (
						<Fragment key={`${hunk.id}-line-${lineIndex}`}>
							<div
								data-diff-line
								data-search-id={searchKey}
								className={cn(
									"group flex items-stretch",
									getLineTypeClass(line),
									selected && "!bg-blue-500/10",
								)}
								onMouseEnter={() =>
									handleLineMouseEnter({
										filePath,
										hunkIndex,
										lineIndex,
									})
								}
								onMouseUp={handleLineMouseUp}
								onClick={(event) => {
									event.preventDefault();
								}}
							>
								<div
									data-testid="line-gutter"
									className="w-24 flex-shrink-0 text-muted-foreground select-none border-r border-border/40 flex items-center gap-[4px] cursor-pointer hover:bg-muted/50"
									onMouseDown={(event) =>
										handleLineMouseDown({
											event,
											filePath,
											hunkIndex,
											lineIndex,
											lineContent: line,
											isStaged: false,
										})
									}
								>
									{lineComments.length > 0 && (
										<MessageSquare className="w-3 h-3 text-primary ml-[4px]" />
									)}
									<span className="w-10 text-right text-sm mr-1">
										{lineNum?.old ?? ""}
									</span>
									<span className="w-10 text-right text-sm">
										{lineNum?.new ?? ""}
									</span>
								</div>
								<div className="w-6 flex-shrink-0 flex items-center justify-center select-none">
									<button
										data-comment-button
										className={cn(
											"p-[2px] rounded bg-primary text-primary-foreground hover:bg-primary/90",
											"invisible group-hover:visible",
										)}
										onMouseDown={(event) => event.stopPropagation()}
										onClick={(event) => {
											event.stopPropagation();
											if (
												diffLineSelection &&
												diffLineSelection.lines.length > 0
											) {
												handleAddCommentFromSelection();
											} else {
												const lineSide: "old" | "new" =
													lineNum?.old !== undefined &&
													lineNum?.new === undefined
														? "old"
														: "new";
												setPendingComment({
													filePath,
													hunkId: hunk.id,
													displayAtLineIndex: lineIndex,
													startLine: actualLineNum,
													endLine: actualLineNum,
													lineContent: [line],
													lineSide,
												});
												setShowCommentInput(true);
											}
										}}
										title={
											diffLineSelection && diffLineSelection.lines.length > 1
												? "Add comment to selected lines"
												: "Add comment"
										}
									>
										<Plus className="w-3 h-3" />
									</button>
								</div>
								<div className="w-5 flex-shrink-0 text-center select-none">
									{getLinePrefix(line)}
								</div>
								<div className="flex-1 px-[8px] py-[2px] whitespace-pre-wrap break-all">
									<HighlightedLine
										content={line.substring(1) || " "}
										language={language}
										searchQuery={debouncedSearchQuery || undefined}
										searchHighlightOffset={searchCurrentOffset}
									/>
								</div>
							</div>

							{/* Inline comments display */}
							{lineComments.length > 0 &&
								actualLineNum === lineComments[0].endLine && (
									<div className="bg-muted/60 border-y border-border/40 px-[16px] py-[8px] space-y-2">
										{lineComments.map((comment) => {
											const isEditing = editingCommentId === comment.id;

											return (
												<div key={comment.id}>
													{isEditing ? (
														<div className="bg-background rounded-md p-[12px] border border-border/60">
															<CommentEditInput
																initialText={comment.text}
																onSave={(newText) =>
																	saveEditComment(comment.id, newText)
																}
																onCancel={cancelEditComment}
																onDiscard={() => deleteComment(comment.id)}
															/>
														</div>
													) : (
														<TooltipProvider>
															<Tooltip>
																<TooltipTrigger asChild>
																	<div
																		data-testid="inline-comment-card"
																		className="group bg-background rounded-md p-[12px] border border-border/60 cursor-pointer hover:shadow-md transition-shadow"
																		onClick={() => startEditComment(comment.id)}
																	>
																		<div className="flex items-start gap-2">
																			<Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
																			<p className="text-sm whitespace-pre-wrap flex-1">
																				{comment.text}
																			</p>
																			<Tooltip>
																				<TooltipTrigger asChild>
																					<button
																						onClick={(event) => {
																							event.stopPropagation();
																							deleteComment(comment.id);
																						}}
																						className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground flex-shrink-0"
																					>
																						<X className="w-3 h-3" />
																					</button>
																				</TooltipTrigger>
																				<TooltipContent>
																					Delete comment
																				</TooltipContent>
																			</Tooltip>
																		</div>
																	</div>
																</TooltipTrigger>
																<TooltipContent>Click to edit</TooltipContent>
															</Tooltip>
														</TooltipProvider>
													)}
												</div>
											);
										})}
									</div>
								)}

							{/* Comment input */}
							{showCommentInputHere && pendingComment && (
								<CommentInput
									key={`comment-${pendingComment.filePath}-${pendingComment.hunkId}-${pendingComment.displayAtLineIndex}`}
									onSubmit={addComment}
									onCancel={cancelComment}
									filePath={pendingComment.filePath}
									startLine={pendingComment.startLine}
									endLine={pendingComment.endLine}
								/>
							)}
						</Fragment>
					);
				})}

				{/* Expand below button */}
				{(() => {
					const afterKey = `${filePath}:${hunkIndex}:after`;
					const afterLines = expandedContext.get(afterKey);

					return (
						<>
							<div
								className="flex items-stretch font-mono text-sm bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors"
								onClick={() =>
									handleExpandContext(filePath, hunkIndex, "after")
								}
							>
								<div className="w-24 flex-shrink-0 border-r border-border/40" />
								<div className="w-6 flex-shrink-0" />
								<div className="w-5 flex-shrink-0" />
								<div className="flex-1 flex items-center justify-center px-[8px] py-[2px] gap-1 text-muted-foreground text-xs">
									<ChevronDown className="w-3 h-3" />
									<span>Show more lines below</span>
								</div>
							</div>
							{afterLines &&
								afterLines.length > 0 &&
								afterLines.map((ctxLine, ctxIdx) => {
									const { newStart, newCount } = parseHunkHeader(hunk.header);
									const ctxLineNum = newStart + newCount + ctxIdx;
									return (
										<div
											key={`${afterKey}-${ctxIdx}`}
											className="flex items-stretch font-mono text-sm"
										>
											<div className="w-24 flex-shrink-0 text-muted-foreground select-none border-r border-border/40 flex items-center">
												<span className="w-10 text-right text-sm mr-1">
													{ctxLineNum}
												</span>
												<span className="w-10 text-right text-sm">
													{ctxLineNum}
												</span>
											</div>
											<div className="w-6 flex-shrink-0" />
											<div className="w-5 flex-shrink-0 text-center select-none">
												{" "}
											</div>
											<div className="flex-1 px-[8px] py-[2px] whitespace-pre-wrap break-all text-muted-foreground">
												<HighlightedLine
													content={ctxLine || " "}
													language={language}
												/>
											</div>
										</div>
									);
								})}
						</>
					);
				})()}
			</Fragment>
		);
	},
);
HunkLines.displayName = "HunkLines";

export { HunkLines };
export type { HunkLinesProps };
