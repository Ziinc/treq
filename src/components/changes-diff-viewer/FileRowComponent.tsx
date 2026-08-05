import React, { memo, useMemo } from "react";
import {
	Check,
	ChevronDown,
	ChevronRight,
	Copy,
	FileText,
	Github,
	Loader2,
	MoreVertical,
	Square,
	X,
} from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Button } from "../ui/button";
import { FileContextMenu } from "../FileContextMenu";
import { CommentInput } from "../CommentInput";
import { GithubCommentCard } from "./GithubCommentCard";
import { buildQuotedPendingComment, getQuoteProp } from "./utils";
import { cn } from "../../lib/utils";
import { highlightCode } from "../../lib/syntax-highlight";
import { highlightInHtml } from "../../lib/text-search";
import { isBinaryFile } from "../../lib/git-utils";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEditorApps } from "../../hooks/useEditorApps";
import type { FileRowComponentProps, HighlightedLineProps } from "./types";

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
		deleteComment,
		getUnplacedThreadsForFile,
		collapsedThreadIds,
		toggleThreadCollapse,
		expandedOutdatedGroups,
		toggleOutdatedGroup,
		showCommentInput,
		pendingComment,
		setPendingComment,
		setShowCommentInput,
		addComment,
		cancelComment,
	} = props;

	const editorApps = useEditorApps();

	const filePath = file.path;
	const fileData = (overrideFileHunks ?? allFileHunks).get(filePath);
	if (!fileData) return <div />;

	const isRename = !!file.oldPath;
	const isCollapsed =
		isBinaryFile(filePath) || isRename ? true : collapsedFiles.has(filePath);
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
				<FileContextMenu filePath={filePath} workspacePath={workspacePath}>
					<div className="sticky top-0 z-10 flex items-center justify-between px-[16px] py-[8px] bg-muted border-b border-border">
						<div className="flex items-center gap-[8px] flex-1 min-w-0">
							{isRename ? (
								<span className="w-3 h-3 flex-shrink-0" />
							) : (
								<button
									role="button"
									aria-label={
										isCollapsed ? "Expand file diff" : "Collapse file diff"
									}
									className="p-0 border-0 bg-transparent cursor-pointer"
									onClick={(event) => {
										event.stopPropagation();
										toggleFileCollapse(filePath);
									}}
								>
									{isCollapsed ? (
										<ChevronRight className="w-3 h-3 flex-shrink-0" />
									) : (
										<ChevronDown className="w-3 h-3 flex-shrink-0" />
									)}
								</button>
							)}
							<div className="min-w-0 flex-1 flex items-center gap-[6px]">
								<span className="text-sm text-muted-foreground truncate font-mono">
									{isRename
										? `${file.oldPath} => ${filePath.replace(/\/+$/, "")}`
										: filePath.replace(/\/+$/, "")}
								</span>
								<button
									onClick={(event) => {
										event.stopPropagation();
										navigator.clipboard.writeText(filePath);
										addToast({
											description: "File path copied to clipboard",
											title: "Copied",
											type: "success",
										});
									}}
									className="text-muted-foreground hover:text-foreground flex-shrink-0"
									title="Copy file path"
								>
									<Copy className="w-4 h-4" />
								</button>
							</div>
						</div>
						<div className="flex items-center gap-[8px]">
							<button
								role="checkbox"
								aria-checked={isViewed}
								aria-label="Viewed"
								onClick={(event) => {
									event.stopPropagation();
									if (isViewed) {
										handleUnmarkFileViewed(filePath);
									} else {
										handleMarkFileViewed(filePath);
									}
								}}
								className={cn(
									"flex items-center gap-[4px] px-[8px] py-[2px] rounded text-sm transition-colors",
									isViewed
										? "bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/35"
										: "bg-muted hover:bg-accent text-muted-foreground hover:text-foreground",
								)}
								title={isViewed ? "Mark as not viewed" : "Mark as viewed"}
							>
								{isViewed ? (
									<Check className="w-3 h-3" />
								) : (
									<Square className="w-3 h-3" />
								)}
								<span>Viewed</span>
							</button>
							{isRename && (
								<span className="text-sm px-[8px] py-[2px] rounded bg-blue-500/25 text-blue-700 dark:text-blue-300">
									Renamed
								</span>
							)}
							{isBinaryFile(filePath) && (
								<span className="text-sm px-[8px] py-[2px] rounded bg-zinc-500/25 text-zinc-700 dark:text-zinc-300">
									Binary
								</span>
							)}
							{(additions > 0 || deletions > 0) && (
								<span className="text-sm font-mono flex items-center gap-[4px]">
									<span className="text-emerald-700 dark:text-emerald-300">
										+{additions}
									</span>
									<span className="text-red-700 dark:text-red-300">
										-{deletions}
									</span>
								</span>
							)}
							{!readOnly && (
								<DropdownMenu>
									<DropdownMenuTrigger
										asChild
										onClick={(event) => event.stopPropagation()}
									>
										<button className="p-[4px] rounded hover:bg-accent">
											<MoreVertical className="w-3 h-3" />
										</button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end" sideOffset={4}>
										{(file.workspaceStatus || file.stagedStatus) && (
											<>
												<DropdownMenuItem
													onSelect={(event) => {
														event.preventDefault();
														handleDiscardFiles(filePath);
													}}
													disabled={fileActionTarget === filePath}
													className="text-red-700 dark:text-red-300 focus:text-red-700 dark:focus:text-red-300"
												>
													{selectedUnstagedFiles.has(filePath) &&
													selectedUnstagedFiles.size > 1
														? `Discard ${selectedUnstagedFiles.size} files`
														: "Discard file"}
												</DropdownMenuItem>
												<DropdownMenuSeparator />
											</>
										)}

										{editorApps.cursor && (
											<DropdownMenuItem
												onSelect={async (event) => {
													event.preventDefault();
													try {
														await openUrl(
															`cursor://file/${workspacePath}/${filePath}`,
														);
													} catch (err) {
														const msg =
															err instanceof Error ? err.message : String(err);
														addToast({
															description: msg,
															title: "Open Failed",
															type: "error",
														});
													}
												}}
											>
												Open in Cursor
											</DropdownMenuItem>
										)}

										{editorApps.vscode && (
											<DropdownMenuItem
												onSelect={async (event) => {
													event.preventDefault();
													try {
														await openUrl(
															`vscode://file/${workspacePath}/${filePath}`,
														);
													} catch (err) {
														const msg =
															err instanceof Error ? err.message : String(err);
														addToast({
															description: msg,
															title: "Open Failed",
															type: "error",
														});
													}
												}}
											>
												Open in VSCode
											</DropdownMenuItem>
										)}

										{editorApps.zed && (
											<DropdownMenuItem
												onSelect={async (event) => {
													event.preventDefault();
													try {
														await openUrl(
															`zed://file/${workspacePath}/${filePath}`,
														);
													} catch (err) {
														const msg =
															err instanceof Error ? err.message : String(err);
														addToast({
															description: msg,
															title: "Open Failed",
															type: "error",
														});
													}
												}}
											>
												Open in Zed
											</DropdownMenuItem>
										)}
									</DropdownMenuContent>
								</DropdownMenu>
							)}
						</div>
					</div>
				</FileContextMenu>

				{!isCollapsed && (
					<div
						className="bg-background font-mono text-sm"
						onContextMenu={handleContextMenu}
					>
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
											<Github
												className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 flex-shrink-0"
												aria-label="GitHub"
											/>
											<span className="text-xs text-muted-foreground">
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
