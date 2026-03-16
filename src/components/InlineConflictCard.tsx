import {
	type Dispatch,
	type SetStateAction,
	useEffect,
	useMemo,
	useRef,
} from "react";
import type { ConflictRegion } from "../lib/api";
import type { ConflictComment, DiffSearchData } from "./ChangesDiffViewer";
import { Button } from "./ui/button";
import { highlightInHtml } from "../lib/text-search";
import { cn } from "../lib/utils";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "./ui/tooltip";
import { Pencil, X } from "lucide-react";
import { ConflictCommentCard } from "./ConflictCommentCard";
import { CommentEditInput } from "./CommentEditInput";

interface InlineConflictCardProps {
	region: ConflictRegion;
	conflictComments: Map<string, ConflictComment>;
	openConflictComments: Set<string>;
	editingConflictCommentId: string | null;
	saveConflictComment: (
		conflictId: string,
		filePath: string,
		conflictNumber: number,
		text: string,
	) => void;
	clearConflictComment: (conflictId: string) => void;
	toggleConflictComment: (conflictId: string) => void;
	setOpenConflictComments: Dispatch<SetStateAction<Set<string>>>;
	startEditConflictComment: (conflictId: string) => void;
	cancelEditConflictComment: () => void;
	saveEditConflictComment: (conflictId: string, newText: string) => void;
	searchData: DiffSearchData;
	debouncedSearchQuery: string;
	currentMatchIndex: number;
	className?: string;
	registerFileRef?: (el: HTMLDivElement | null) => void;
}

const isConflictMarker = (line: string): boolean => {
	return /^(<{7}|>{7}|%{7}|\+{7}|-{7}|\|{7}|={7})/.test(line);
};

const getConflictLineBackground = (line: string): string => {
	if (isConflictMarker(line)) return "";
	if (line.startsWith("-")) return "bg-red-500/20";
	if (line.startsWith("+")) return "bg-emerald-500/20";
	return "";
};

export const InlineConflictCard = ({
	region,
	conflictComments,
	openConflictComments,
	editingConflictCommentId,
	saveConflictComment,
	clearConflictComment,
	toggleConflictComment,
	setOpenConflictComments,
	startEditConflictComment,
	cancelEditConflictComment,
	saveEditConflictComment,
	searchData,
	debouncedSearchQuery,
	currentMatchIndex,
	className,
	registerFileRef,
}: InlineConflictCardProps) => {
	const cardRef = useRef<HTMLDivElement>(null);
	const lines = useMemo(() => region.content.split("\n"), [region.content]);
	const hasComment = conflictComments.has(region.id);

	useEffect(() => {
		if (!registerFileRef) return;
		const el = cardRef.current;
		if (el) {
			registerFileRef(el);
		}
		return () => {
			registerFileRef(null);
		};
	}, [registerFileRef]);

	const closeConflictInput = () => {
		setOpenConflictComments((prev) => {
			const next = new Set(prev);
			next.delete(region.id);
			return next;
		});
	};

	return (
		<div ref={cardRef} className={className}>
			<div className="p-0 relative">
				<pre className="text-sm font-mono overflow-x-auto bg-muted/30 p-3 rounded whitespace-pre-wrap break-all">
					{lines.map((line, idx) => {
						const isMarker = isConflictMarker(line);
						const bgClass = getConflictLineBackground(line);
						const conflictSearchKey = `conflict:${region.id}:${idx}`;
						const conflictLineData =
							searchData.matchesByKey.get(conflictSearchKey);
						let conflictHighlightOffset = -1;
						if (conflictLineData && debouncedSearchQuery) {
							const gf = conflictLineData.firstGlobalIndex;
							if (
								currentMatchIndex >= gf &&
								currentMatchIndex < gf + conflictLineData.count
							) {
								conflictHighlightOffset = currentMatchIndex - gf;
							}
						}
						const hasSearchHighlight = Boolean(
							debouncedSearchQuery && conflictLineData,
						);
						const lineHtml = hasSearchHighlight
							? highlightInHtml(
									line,
									debouncedSearchQuery,
									conflictHighlightOffset,
								).html
							: null;

						return (
							<div
								key={idx}
								data-search-id={conflictSearchKey}
								className={cn(isMarker ? "text-muted-foreground" : "", bgClass)}
							>
								{lineHtml ? (
									<span dangerouslySetInnerHTML={{ __html: lineHtml }} />
								) : (
									line
								)}
							</div>
						);
					})}
				</pre>
				<div className="mt-2 flex justify-end absolute right-3 bottom-3">
					<Button
						variant="secondary"
						size="sm"
						onClick={() => toggleConflictComment(region.id)}
						aria-label="Add comment"
					>
						Add comment
					</Button>
				</div>
			</div>

			{hasComment && (
				<div className="px-3 py-2 bg-muted/40 border-t border-border">
					<div className="text-muted-foreground mb-1">Resolution note:</div>
					{editingConflictCommentId === region.id ? (
						<div className="bg-background rounded-md p-[12px] border border-border/60">
							<CommentEditInput
								initialText={conflictComments.get(region.id)?.text || ""}
								onSave={(newText) =>
									saveEditConflictComment(region.id, newText)
								}
								onCancel={cancelEditConflictComment}
								onDiscard={() => {
									clearConflictComment(region.id);
									cancelEditConflictComment();
								}}
							/>
						</div>
					) : (
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger asChild>
									<div
										className="group bg-background rounded-md p-[12px] border border-border/60 cursor-pointer hover:shadow-md transition-shadow"
										onClick={() => startEditConflictComment(region.id)}
									>
										<div className="flex items-start gap-2">
											<Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
											<p className="text-sm whitespace-pre-wrap flex-1">
												{conflictComments.get(region.id)?.text}
											</p>
											<Tooltip>
												<TooltipTrigger asChild>
													<button
														onClick={(e) => {
															e.stopPropagation();
															clearConflictComment(region.id);
														}}
														className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground flex-shrink-0"
													>
														<X className="w-3 h-3" />
													</button>
												</TooltipTrigger>
												<TooltipContent>Delete comment</TooltipContent>
											</Tooltip>
										</div>
									</div>
								</TooltipTrigger>
								<TooltipContent>Click to edit</TooltipContent>
							</Tooltip>
						</TooltipProvider>
					)}
				</div>
			)}

			{openConflictComments.has(region.id) && (
				<ConflictCommentCard
					conflictId={region.id}
					filePath={region.filePath}
					conflictNumber={region.conflictNumber}
					startLine={region.startLine}
					endLine={region.endLine}
					comment={conflictComments.get(region.id)}
					onSave={(text) => {
						saveConflictComment(
							region.id,
							region.filePath,
							region.conflictNumber,
							text,
						);
						closeConflictInput();
					}}
					onClear={() => {
						clearConflictComment(region.id);
						closeConflictInput();
					}}
				/>
			)}
		</div>
	);
};
