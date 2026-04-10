/* eslint-disable max-params */
import React, {
	Fragment,
	forwardRef,
	memo,
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "../ui/alert-dialog";
import {
	AlertTriangle,
	Check,
	CheckCircle2,
	Copy,
	FileText,
	Loader2,
	MessageSquare,
	RefreshCw,
	Send,
	X,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "../ui/tooltip";
import {
	type ConflictRegion,
	type JjDiffHunk,
	type JjRevisionDiff,
	clearPendingReview,
	createCommit,
	getDiffCache,
	getSetting,
	getWorkspaceChangedFiles,
	getWorkspaceDiff,
	getWorkspaceFileHunks,
	getWorkspaceFileLines,
	jjRestoreAll,
	jjRestoreFile,
	jjSplit,
	loadPendingReview,
	markFileViewed,
	parseConflictMarkers,
	savePendingReview,
	unmarkFileViewed,
} from "../../lib/api";
import { type ParsedFileChange, isBinaryFile, parseJjChangedFiles } from "../../lib/git-utils";
import { Button } from "../ui/button";
import { ChangesSection } from "../ChangesSection";
import { CommittedChangesSection } from "../CommittedChangesSection";
import { ConflictsSection } from "../ConflictsSection";
import { FileRowComponent } from "./FileRowComponent";
import { HunkLines } from "./HunkLines";
import { InlineConflictCard } from "../InlineConflictCard";
import { SearchOverlay } from "../SearchOverlay";
import { Textarea } from "../ui/textarea";
import { cn, getFileName } from "../../lib/utils";
import { escapeRegex } from "../../lib/text-search";
import { listen } from "@tauri-apps/api/event";
import { useCachedWorkspaceChanges } from "../../hooks/useCachedWorkspaceChanges";
import { useDebounce } from "../../hooks/useDebounce";
import { useDiffSettings } from "../../hooks/useDiffSettings";
import { useFocusRefreshSubscription } from "../../hooks/useAppFocusHandler";
import { useKeyboardShortcut } from "../../hooks/useKeyboard";
import { useToast } from "../ui/toast";
import { v4 as uuidv4 } from "uuid";
import { CommitInput } from "./CommitInput";
import {
	computeHunkLineNumbers,
	computeHunksHash,
	filesEqual,
	hunksEqual,
	parseCachedHunks,
	parseHunkHeader,
	toApiLineComment,
	toLocalLineComment,
} from "./utils";
import type {
	ChangesDiffViewerHandle,
	ChangesDiffViewerProps,
	CommitInputHandle,
	ConflictComment,
	DiffLineSelection,
	DiffSearchData,
	FileHunksData,
	LineComment,
	PendingComment,
} from "./types";

export const ChangesDiffViewer = memo(
	forwardRef<ChangesDiffViewerHandle, ChangesDiffViewerProps>(
		(
			{
				workspacePath,
				repoPath,
				workspaceId,
				readOnly = false,
				onStagedFilesChange,
				onChangedFilesChange,
				onRefreshingChange,
				initialSelectedFile,
				onReviewSubmitted,
				onCreateAgentWithReview,
				conflictedFiles = [],
				showCommittedChanges = false,
				onMoveFilesToNewWorkspace,
			},
			ref,
		) => {
			void conflictedFiles;
			const { addToast } = useToast();
			const { fontSize: diffFontSize } = useDiffSettings();

			const cachedChanges = useCachedWorkspaceChanges(workspacePath, {
				enabled: true,
				repoPath: workspacePath,
				workspaceId: null,
			});

			const [files, setFiles] = useState<ParsedFileChange[]>([]);
			const [allFileHunks, setAllFileHunks] = useState<Map<string, FileHunksData>>(new Map());
			const [loadingAllHunks, setLoadingAllHunks] = useState(false);
			const [initialLoading, setInitialLoading] = useState(true);
			const [, setRefreshing] = useState(false);
			const [fileActionTarget, setFileActionTarget] = useState<string | null>(null);
			const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());
			const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
			const [expandedLargeDiffs, setExpandedLargeDiffs] = useState<Set<string>>(new Set());
			const [largeChangesetExpanded, setLargeChangesetExpanded] = useState(false);
			const [expandedContext, setExpandedContext] = useState<Map<string, string[]>>(new Map());
			const [diffLineSelection, setDiffLineSelection] = useState<DiffLineSelection | null>(null);
			const [isSelecting, setIsSelecting] = useState(false);
			const [selectionAnchor, setSelectionAnchor] = useState<{ filePath: string; hunkIndex: number; lineIndex: number } | null>(null);
			const [, setCurrentDragLine] = useState<{ filePath: string; hunkIndex: number; lineIndex: number } | null>(null);
			const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);
			const [commitPending, setCommitPending] = useState(false);
			const [conflictMarkerStyle, setConflictMarkerStyle] = useState<string>("git");
			const commitInputRef = useRef<CommitInputHandle>(null);
			const prevFilePathsRef = useRef<string[]>([]);
			const diffContainerRef = useRef<HTMLDivElement>(null);
			const isReloadingRef = useRef<boolean>(false);
			const isDraggingRef = useRef<boolean>(false);
			const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
			const [isSearchOpen, setIsSearchOpen] = useState(false);
			const [searchQuery, setSearchQuery] = useState("");
			const debouncedSearchQuery = useDebounce(searchQuery, 150);
			const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
			const [searchFocusTrigger, setSearchFocusTrigger] = useState(0);
			const [committedFiles, setCommittedFiles] = useState<import("../../lib/api").JjFileChange[]>([]);
			const [committedSectionCollapsed, setCommittedSectionCollapsed] = useState(false);
			const conflictFileRefs = useRef<Map<string, HTMLDivElement>>(new Map());
			const [comments, setComments] = useState<LineComment[]>([]);
			const [conflictComments, setConflictComments] = useState<Map<string, ConflictComment>>(new Map());
			const [openConflictComments, setOpenConflictComments] = useState<Set<string>>(new Set());
			const [editingConflictCommentId, setEditingConflictCommentId] = useState<string | null>(null);
			const [showCommentInput, setShowCommentInput] = useState(false);
			const [reviewPopoverOpen, setReviewPopoverOpen] = useState(false);
			const [finalReviewComment, setFinalReviewComment] = useState("");
			const [showCancelDialog, setShowCancelDialog] = useState(false);
			const [copiedReview, setCopiedReview] = useState(false);
			const [hasUserAddedComments, setHasUserAddedComments] = useState(false);
			const [editingCommentId, setEditingCommentId] = useState<string | null>(null);

			const isInReviewMode = useMemo(() => (
				hasUserAddedComments ||
				showCommentInput ||
				reviewPopoverOpen ||
				finalReviewComment.trim().length > 0
			), [hasUserAddedComments, showCommentInput, reviewPopoverOpen, finalReviewComment]);

			const [actualConflictedFiles, setActualConflictedFiles] = useState<string[]>([]);
			const [conflictRegionsByFile, setConflictRegionsByFile] = useState<Map<string, ConflictRegion[]>>(new Map());

			const conflictLineLookups = useMemo(() => {
				const map = new Map<string, Map<number, ConflictRegion>>();
				for (const [filePath, regions] of conflictRegionsByFile) {
					if (!regions || regions.length === 0) continue;
					const lineMap = new Map<number, ConflictRegion>();
					for (const region of regions) {
						for (let line = region.start_line; line <= region.end_line; line++) {
							lineMap.set(line, region);
						}
					}
					map.set(filePath, lineMap);
				}
				return map;
			}, [conflictRegionsByFile]);

			const firstConflictRegionIdByFile = useMemo(() => {
				const map = new Map<string, string>();
				for (const [filePath, regions] of conflictRegionsByFile) {
					if (regions && regions.length > 0) {
						map.set(filePath, regions[0].id);
					}
				}
				return map;
			}, [conflictRegionsByFile]);

			const filesWithMarkers = useMemo(() => {
				const result: { filePath: string; content: string }[] = [];
				const extractContent = (hunks: JjDiffHunk[]): string | null => {
					const lines: string[] = [];
					let hasConflictMarkers = false;
					for (const hunk of hunks) {
						if (!hunk || !hunk.lines) continue;
						for (const line of hunk.lines) {
							if (!line) continue;
							if (line.startsWith("+") || line.startsWith(" ")) {
								const content = line.substring(1);
								lines.push(content);
								if (content.includes("<<<<<<<")) {
									hasConflictMarkers = true;
								}
							}
						}
					}
					return hasConflictMarkers ? lines.join("\n") : null;
				};
				const allFiles = [
					...(files && Array.isArray(files) ? files : []),
					...(showCommittedChanges && committedFiles && Array.isArray(committedFiles) ? committedFiles : []),
				];
				for (const file of allFiles) {
					if (!file || !file.path) continue;
					const fileHunksData = allFileHunks.get(file.path);
					if (!fileHunksData || fileHunksData.isLoading || !fileHunksData.hunks) continue;
					const content = extractContent(fileHunksData.hunks);
					if (content) {
						result.push({ content, filePath: file.path });
					}
				}
				return result;
			}, [files, allFileHunks, showCommittedChanges, committedFiles]);

			useEffect(() => {
				if (filesWithMarkers.length === 0) {
					setActualConflictedFiles([]);
					setConflictRegionsByFile(new Map());
					return;
				}
				const expectedStyle: "jj" | "git" = conflictMarkerStyle === "git" ? "git" : "jj";
				let cancelled = false;
				Promise.all(
					filesWithMarkers.map(({ filePath, content }) =>
						parseConflictMarkers(content, filePath).then((allRegions) => {
							const filtered: ConflictRegion[] = [];
							for (const region of allRegions) {
								if (region.marker_style === expectedStyle) filtered.push(region);
							}
							const regions = filtered.length > 0 ? filtered : allRegions.length > 0 ? allRegions : null;
							return { filePath, regions };
						}),
					),
				).then((results) => {
					if (cancelled) return;
					const conflicted: string[] = [];
					const regionsByFile = new Map<string, ConflictRegion[]>();
					for (const { filePath, regions } of results) {
						if (regions) {
							conflicted.push(filePath);
							regionsByFile.set(filePath, regions);
						}
					}
					setActualConflictedFiles(conflicted);
					setConflictRegionsByFile(regionsByFile);
				});
				return () => { cancelled = true; };
			}, [filesWithMarkers, conflictMarkerStyle]);

			const searchData = useMemo<DiffSearchData>(() => {
				const matches: DiffSearchData["matches"] = [];
				const matchesByKey = new Map<string, { firstGlobalIndex: number; count: number }>();
				if (!debouncedSearchQuery) return { matches, matchesByKey };
				const escapedQuery = escapeRegex(debouncedSearchQuery);
				const regex = new RegExp(escapedQuery, "gi");
				const countLineMatches = (text: string): number => {
					regex.lastIndex = 0;
					let count = 0;
					while (regex.exec(text) !== null) count++;
					return count;
				};
				const processConflictRegion = (region: ConflictRegion) => {
					const lines = region.content.split("\n");
					for (let idx = 0; idx < lines.length; idx++) {
						const matchCount = countLineMatches(lines[idx]);
						if (matchCount > 0) {
							const key = `conflict:${region.id}:${idx}`;
							matchesByKey.set(key, { count: matchCount, firstGlobalIndex: matches.length });
							for (let matchIdx = 0; matchIdx < matchCount; matchIdx++) {
								matches.push({ filePath: region.file_path, hunkIndex: -1, lineIndex: idx, matchIndexInLine: matchIdx });
							}
						}
					}
				};
				for (const [, regions] of conflictRegionsByFile) {
					for (const region of regions) processConflictRegion(region);
				}
				const processFile = (filePath: string) => {
					const fileData = allFileHunks.get(filePath);
					if (!fileData || fileData.isLoading || !fileData.hunks) return;
					if (collapsedFiles.has(filePath)) return;
					if (isBinaryFile(filePath)) return;
					const conflictLineMap = conflictLineLookups.get(filePath);
					let additions = 0, deletions = 0;
					for (const hunk of fileData.hunks) {
						for (const line of hunk.lines) {
							if (line.startsWith("+")) additions++;
							else if (line.startsWith("-")) deletions++;
						}
					}
					if (additions + deletions > 250 && !expandedLargeDiffs.has(filePath)) return;
					for (let hunkIndex = 0; hunkIndex < fileData.hunks.length; hunkIndex++) {
						const hunk = fileData.hunks[hunkIndex];
						const lineNumbers = computeHunkLineNumbers(hunk);
						for (let lineIndex = 0; lineIndex < hunk.lines.length; lineIndex++) {
							const newLineNumber = lineNumbers[lineIndex]?.new;
							if (newLineNumber !== undefined && conflictLineMap?.has(newLineNumber)) continue;
							const lineText = hunk.lines[lineIndex].substring(1);
							const mc = countLineMatches(lineText);
							if (mc > 0) {
								const key = `${filePath}:${hunkIndex}:${lineIndex}`;
								matchesByKey.set(key, { count: mc, firstGlobalIndex: matches.length });
								for (let matchIdx = 0; matchIdx < mc; matchIdx++) {
									matches.push({ filePath, hunkIndex, lineIndex, matchIndexInLine: matchIdx });
								}
							}
						}
					}
				};
				for (const file of files) processFile(file.path);
				if (showCommittedChanges) {
					for (const file of committedFiles) processFile(file.path);
				}
				return { matches, matchesByKey };
			}, [debouncedSearchQuery, files, allFileHunks, collapsedFiles, expandedLargeDiffs, showCommittedChanges, committedFiles, conflictLineLookups]);

			useEffect(() => {
				if (searchData.matches.length === 0) {
					setCurrentMatchIndex(0);
				} else if (currentMatchIndex >= searchData.matches.length) {
					setCurrentMatchIndex(0);
				}
			}, [searchData.matches.length]);

			useEffect(() => {
				setIsSearchOpen(false);
				setSearchQuery("");
				setCurrentMatchIndex(0);
			}, [workspacePath]);

			useEffect(() => {
				getSetting("conflict_marker_style").then((style: string | null) => {
					if (style) setConflictMarkerStyle(style);
				});
			}, []);

			useKeyboardShortcut("f", true, () => {
				setIsSearchOpen(true);
				setSearchFocusTrigger((prev) => prev + 1);
			}, []);

			const scrollToSearchMatch = useCallback((matchIdx: number) => {
				if (!diffContainerRef.current || searchData.matches.length === 0) return;
				const match = searchData.matches[matchIdx];
				if (!match) return;
				const searchId = match.hunkIndex === -1
					? `conflict:${match.filePath}:${match.lineIndex}`
					: `${match.filePath}:${match.hunkIndex}:${match.lineIndex}`;
				const el = diffContainerRef.current.querySelector(`[data-search-id="${CSS.escape(searchId)}"]`);
				if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
			}, [searchData.matches]);

			const handleSearchNext = useCallback(() => {
				if (searchData.matches.length === 0) return;
				const next = (currentMatchIndex + 1) % searchData.matches.length;
				setCurrentMatchIndex(next);
				scrollToSearchMatch(next);
			}, [currentMatchIndex, searchData.matches.length, scrollToSearchMatch]);

			const handleSearchPrevious = useCallback(() => {
				if (searchData.matches.length === 0) return;
				const prev = (currentMatchIndex - 1 + searchData.matches.length) % searchData.matches.length;
				setCurrentMatchIndex(prev);
				scrollToSearchMatch(prev);
			}, [currentMatchIndex, searchData.matches.length, scrollToSearchMatch]);

			const handleSearchClose = useCallback(() => {
				setIsSearchOpen(false);
				setSearchQuery("");
				setCurrentMatchIndex(0);
			}, []);

			const [staleFiles, setStaleFiles] = useState<Set<string>>(new Set());
			const [pendingFilesData, setPendingFilesData] = useState<ParsedFileChange[] | null>(null);
			const [pendingHunksData, setPendingHunksData] = useState<Map<string, FileHunksData> | null>(null);
			const [sendingReview, setSendingReview] = useState(false);
			const [pendingComment, setPendingComment] = useState<PendingComment | null>(null);
			const [viewedFiles, setViewedFiles] = useState<Map<string, { viewedAt: string; contentHash: string }>>(new Map());
			const [selectedUnstagedFiles, setSelectedUnstagedFiles] = useState<Set<string>>(new Set());
			const [lastSelectedFileIndex, setLastSelectedFileIndex] = useState<number | null>(null);
			const [stagedFiles, setStagedFiles] = useState<Set<string>>(new Set());
			const [selectedStagedFiles, setSelectedStagedFiles] = useState<Set<string>>(new Set());
			const [lastSelectedStagedIndex, setLastSelectedStagedIndex] = useState<number | null>(null);

			const applyChangedFiles = useCallback(
				(parsed: ParsedFileChange[], forceApply = false) => {
					onChangedFilesChange?.(parsed);
					if (isInReviewMode && !forceApply) {
						setFiles((prev) => {
							if (filesEqual(prev, parsed)) return prev;
							const prevPaths = new Set(prev.map((f) => f.path));
							const newPaths = new Set(parsed.map((f) => f.path));
							const changedFiles = new Set<string>();
							for (const path of newPaths) { if (!prevPaths.has(path)) changedFiles.add(path); }
							for (const path of prevPaths) { if (!newPaths.has(path)) changedFiles.add(path); }
							for (const newFile of parsed) {
								const oldFile = prev.find((f) => f.path === newFile.path);
								if (oldFile && (oldFile.stagedStatus !== newFile.stagedStatus || oldFile.workspaceStatus !== newFile.workspaceStatus)) {
									changedFiles.add(newFile.path);
								}
							}
							if (changedFiles.size > 0) {
								setStaleFiles((prevStale) => new Set([...prevStale, ...changedFiles]));
								setPendingFilesData(parsed);
							}
							return prev;
						});
						return;
					}
					setFiles((prev) => {
						if (filesEqual(prev, parsed)) return prev;
						return parsed;
					});
					setStaleFiles(new Set());
					setPendingFilesData(null);
					setPendingHunksData(null);
					if (initialSelectedFile && parsed.some((f) => f.path === initialSelectedFile)) {
						setSelectedUnstagedFiles(new Set([initialSelectedFile]));
					}
					if (onStagedFilesChange) {
						const staged = parsed.filter((f) => f.stagedStatus && f.stagedStatus !== " ").map((f) => f.path);
						onStagedFilesChange(Array.from(new Set(staged)));
					}
				},
				[initialSelectedFile, onStagedFilesChange, onChangedFilesChange, isInReviewMode],
			);

			const invalidateCache = useCallback(async () => {
				await cachedChanges.refresh();
			}, [cachedChanges]);

			const loadChangedFiles = useCallback(async () => {
				setRefreshing(true);
				onRefreshingChange?.(true);
				try {
					const jjFiles = await getWorkspaceChangedFiles(repoPath ?? "", workspaceId ?? null);
					const parsed = parseJjChangedFiles(jjFiles);
					applyChangedFiles(parsed);
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					addToast({ description: message, title: "JJ Error", type: "error" });
				} finally {
					setInitialLoading(false);
					setRefreshing(false);
					onRefreshingChange?.(false);
				}
			}, [workspacePath, applyChangedFiles, addToast, onRefreshingChange]);

			useEffect(() => { loadChangedFiles(); }, [workspacePath]);

			useImperativeHandle(ref, () => ({
				focusCommitInput: () => { commitInputRef.current?.focus(); },
				refresh: () => { loadChangedFiles(); },
			}), [loadChangedFiles]);

			useFocusRefreshSubscription("afterInvalidate", () => { loadChangedFiles(); }, [loadChangedFiles]);

			useEffect(() => {
				if (!workspaceId) return;
				const unlisten = listen<{ workspace_id: number; changed_paths: string[] }>("workspace-files-changed", (event) => {
					if (event.payload.workspace_id === workspaceId) loadChangedFiles();
				});
				return () => { unlisten.then((fn) => fn()); };
			}, [workspaceId, loadChangedFiles]);

			useEffect(() => {
				const loadReview = async () => {
					if (repoPath && workspaceId !== undefined) {
						try {
							const pendingReview = await loadPendingReview(repoPath, workspaceId);
							if (pendingReview) {
								setComments(pendingReview.comments.map(toLocalLineComment));
								if (pendingReview.summary_text) setFinalReviewComment(pendingReview.summary_text);
								setHasUserAddedComments(pendingReview.comments.length > 0);
								const loadedComments = await loadPendingReview(repoPath, workspaceId);
								if (loadedComments && loadedComments.comments.length > 0) {
									setComments(loadedComments.comments.map(toLocalLineComment));
								}
							}
						} catch (error) {
							console.error("Failed to load pending review:", error);
						}
					}
				};
				loadReview();
			}, [repoPath, workspaceId]);

			const refreshCommittedChanges = useCallback(async () => {
				if (showCommittedChanges && repoPath && workspaceId !== undefined) {
					try {
						const mergeDiff: JjRevisionDiff = await getWorkspaceDiff(repoPath, workspaceId);
						setCommittedFiles(mergeDiff.files);
						setAllFileHunks((prev) => {
							const updated = new Map(prev);
							for (const fileDiff of mergeDiff.hunks_by_file) {
								updated.set(fileDiff.path, { filePath: fileDiff.path, hunks: fileDiff.hunks, isLoading: false });
							}
							return updated;
						});
					} catch (error) {
						console.error("Failed to fetch committed changes:", error);
						addToast?.({ description: error instanceof Error ? error.message : "Unknown error", title: "Failed to load committed changes", type: "error" });
					}
					return;
				}
				setCommittedFiles((previousCommittedFiles) => {
					setAllFileHunks((prev) => {
						const updated = new Map(prev);
						for (const file of previousCommittedFiles) updated.delete(file.path);
						return updated;
					});
					return [];
				});
			}, [showCommittedChanges, repoPath, workspaceId, addToast]);

			useEffect(() => { refreshCommittedChanges(); }, [refreshCommittedChanges]);

			const debouncedComments = useDebounce(comments, 500);
			const debouncedSummary = useDebounce(finalReviewComment, 500);

			useEffect(() => {
				const saveReview = async () => {
					if (!repoPath || workspaceId === undefined) return;
					if (debouncedComments.length === 0 && !debouncedSummary.trim()) return;
					try {
						await savePendingReview(repoPath, workspaceId, debouncedComments.map(toApiLineComment), undefined, debouncedSummary.trim() || undefined);
					} catch (error) {
						console.error("Failed to auto-save review:", error);
					}
				};
				saveReview();
			}, [debouncedComments, debouncedSummary, repoPath, workspaceId]);

			useEffect(() => {
				if (files.length === 0) return;
				const currentFilePaths = new Set(files.map((f) => f.path));
				const staleViewedFiles: string[] = [];
				setViewedFiles((prev) => {
					let hasChanges = false;
					const next = new Map(prev);
					for (const [filePath, viewData] of prev.entries()) {
						if (!currentFilePaths.has(filePath)) { next.delete(filePath); hasChanges = true; continue; }
						const fileData = allFileHunks.get(filePath);
						if (fileData && !fileData.isLoading && fileData.hunks.length > 0) {
							const currentHash = computeHunksHash(fileData.hunks);
							if (viewData.contentHash && currentHash !== viewData.contentHash) {
								next.delete(filePath);
								staleViewedFiles.push(filePath);
								hasChanges = true;
							}
						}
					}
					return hasChanges ? next : prev;
				});
				for (const filePath of staleViewedFiles) {
					unmarkFileViewed(workspacePath, filePath).catch(() => {});
				}
			}, [files, allFileHunks, workspacePath]);

			const handleMarkFileViewed = useCallback(async (filePath: string) => {
				const fileData = allFileHunks.get(filePath);
				const contentHash = fileData?.hunks ? computeHunksHash(fileData.hunks) : "";
				try {
					await markFileViewed(workspacePath, filePath, contentHash);
					const now = new Date().toISOString();
					setViewedFiles((prev) => new Map(prev).set(filePath, { contentHash, viewedAt: now }));
					setCollapsedFiles((prev) => new Set(prev).add(filePath));
				} catch {}
			}, [workspacePath, allFileHunks]);

			const handleUnmarkFileViewed = useCallback(async (filePath: string) => {
				try {
					await unmarkFileViewed(workspacePath, filePath);
					setViewedFiles((prev) => { const next = new Map(prev); next.delete(filePath); return next; });
					setCollapsedFiles((prev) => { const next = new Set(prev); next.delete(filePath); return next; });
				} catch {}
			}, [workspacePath]);

			const loadAllFileHunks = useCallback(
				async (filesToLoad: ParsedFileChange[], forceApply = false) => {
					if (filesToLoad.length === 0) {
						if (!isInReviewMode || forceApply) {
							setAllFileHunks((prev) => (prev.size === 0 ? prev : new Map()));
						}
						setLoadingAllHunks(false);
						return;
					}
					setLoadingAllHunks(true);
					const cachedHunks = new Map<string, JjDiffHunk[]>();
					const hunksMap = new Map<string, FileHunksData>();
					await Promise.all(filesToLoad.map(async (file) => {
						try {
							const cache = await getDiffCache(workspacePath, "file_hunks", file.path);
							if (cache?.data) {
								const hunks = parseCachedHunks(cache.data);
								if (hunks) { cachedHunks.set(file.path, hunks); hunksMap.set(file.path, { filePath: file.path, hunks, isLoading: false }); }
							}
						} catch {}
					}));
					filesToLoad.forEach((file) => {
						if (!hunksMap.has(file.path)) hunksMap.set(file.path, { filePath: file.path, hunks: [], isLoading: true });
					});
					if (cachedHunks.size > 0 && (!isInReviewMode || forceApply)) {
						setAllFileHunks((prev) => {
							let needsUpdate = prev.size !== hunksMap.size;
							if (!needsUpdate) {
								for (const [path, data] of hunksMap) {
									const existing = prev.get(path);
									if (!existing || existing.isLoading !== data.isLoading || !hunksEqual(existing.hunks, data.hunks)) { needsUpdate = true; break; }
								}
							}
							return needsUpdate ? new Map(hunksMap) : prev;
						});
					}
					try {
						const results = await Promise.all(filesToLoad.map(async (file) => {
							try {
								const hunks = await getWorkspaceFileHunks(repoPath ?? "", workspaceId ?? null, file.path);
								return { filePath: file.path, hunks, error: null as string | null };
							} catch (error) {
								return { filePath: file.path, hunks: [] as JjDiffHunk[], error: error instanceof Error ? error.message : String(error) };
							}
						}));
						if (isInReviewMode && !forceApply && !isReloadingRef.current) {
							const newHunksMap = new Map<string, FileHunksData>();
							const changedFiles = new Set<string>();
							for (const result of results) {
								const existing = allFileHunks.get(result.filePath);
								const newData: FileHunksData = result.error
									? { error: result.error, filePath: result.filePath, hunks: [], isLoading: false }
									: { filePath: result.filePath, hunks: result.hunks, isLoading: false };
								newHunksMap.set(result.filePath, newData);
								if (!existing || !hunksEqual(existing.hunks, result.hunks)) changedFiles.add(result.filePath);
							}
							if (changedFiles.size > 0) { setStaleFiles((prev) => new Set([...prev, ...changedFiles])); setPendingHunksData(newHunksMap); }
							setLoadingAllHunks(false);
							return;
						}
						setAllFileHunks((prev) => {
							let hasChanges = false;
							const next = new Map(prev);
							for (const result of results) {
								const existing = prev.get(result.filePath);
								if (result.error) {
									if (!existing || existing.error !== result.error) { hasChanges = true; next.set(result.filePath, { error: result.error, filePath: result.filePath, hunks: [], isLoading: false }); }
									continue;
								}
								if (!existing || existing.isLoading || !hunksEqual(existing.hunks, result.hunks)) { hasChanges = true; next.set(result.filePath, { filePath: result.filePath, hunks: result.hunks, isLoading: false }); }
							}
							return hasChanges ? next : prev;
						});
					} finally {
						setLoadingAllHunks(false);
					}
				},
				[workspacePath, isInReviewMode, allFileHunks],
			);

			useEffect(() => {
				const currentPaths = files.map((f) => f.path);
				const pathsChanged = currentPaths.length !== prevFilePathsRef.current.length || currentPaths.some((p, i) => p !== prevFilePathsRef.current[i]);
				if (files.length > 0 && pathsChanged) {
					prevFilePathsRef.current = currentPaths;
					loadAllFileHunks(files);
					setLargeChangesetExpanded(false);
				} else if (files.length === 0 && prevFilePathsRef.current.length > 0) {
					prevFilePathsRef.current = [];
					setAllFileHunks(new Map());
					setLargeChangesetExpanded(false);
				}
			}, [files, loadAllFileHunks]);

			const refresh = useCallback(() => { cachedChanges.refresh(); }, [cachedChanges]);

			const handleReloadWithPendingChanges = useCallback(() => {
				isReloadingRef.current = true;
				if (pendingFilesData) {
					const orphanedComments: LineComment[] = [];
					const validComments: LineComment[] = [];
					for (const comment of comments) {
						const newFileData = pendingHunksData?.get(comment.filePath);
						const fileStillExists = pendingFilesData.some((f) => f.path === comment.filePath);
						if (!fileStillExists || !newFileData) { orphanedComments.push(comment); continue; }
						const hunkStillExists = newFileData.hunks.some((h) => h.id === comment.hunkId);
						if (!hunkStillExists) { orphanedComments.push(comment); continue; }
						validComments.push(comment);
					}
					if (orphanedComments.length > 0) {
						addToast({ description: `${orphanedComments.length} outdated comment${orphanedComments.length > 1 ? "s" : ""} discarded (lines changed)`, title: "Comments discarded", type: "info" });
					}
					setComments(validComments);
					applyChangedFiles(pendingFilesData, true);
				}
				if (pendingHunksData) { setAllFileHunks(pendingHunksData); setPendingHunksData(null); }
				setStaleFiles(new Set());
				setPendingFilesData(null);
				setTimeout(() => { isReloadingRef.current = false; }, 100);
			}, [pendingFilesData, pendingHunksData, comments, applyChangedFiles, addToast]);

			const handleDiscardAll = useCallback(async () => {
				if (readOnly) return;
				try {
					await jjRestoreAll(workspacePath);
					addToast({ description: "All changes discarded", title: "Discarded", type: "success" });
					await invalidateCache();
					refresh();
				} catch (error) {
					addToast({ description: error instanceof Error ? error.message : String(error), title: "Discard All Failed", type: "error" });
				}
			}, [workspacePath, readOnly, refresh, addToast, invalidateCache]);

			const handleDiscardFiles = useCallback(async (filePath: string) => {
				if (readOnly || !filePath) return;
				const filesToDiscard = selectedUnstagedFiles.has(filePath) && selectedUnstagedFiles.size > 0 ? Array.from(selectedUnstagedFiles) : [filePath];
				setFileActionTarget(filePath);
				try {
					await Promise.all(filesToDiscard.map((file) => jjRestoreFile(workspacePath, file)));
					const count = filesToDiscard.length;
					const description = count === 1 ? `${filesToDiscard[0]} discarded` : `${count} files discarded`;
					addToast({ description, title: "Discarded", type: "success" });
					setSelectedUnstagedFiles(new Set());
					await invalidateCache();
					refresh();
				} catch (error) {
					addToast({ description: error instanceof Error ? error.message : String(error), title: "Discard Failed", type: "error" });
				} finally {
					setFileActionTarget(null);
				}
			}, [readOnly, selectedUnstagedFiles, refresh, addToast, invalidateCache]);

			const scrollToFileIfNeeded = useCallback((filePath: string) => {
				if (!filePath) return;
				setLargeChangesetExpanded(true);
				setCollapsedFiles((prev) => { const next = new Set(prev); next.delete(filePath); return next; });
				setExpandedLargeDiffs((prev) => { const next = new Set(prev); next.add(filePath); return next; });
				setTimeout(() => {
					const container = diffContainerRef.current;
					if (!container) return;
					const fileId = `file-section-${filePath.replace(/[^a-zA-Z0-9]/g, "-")}`;
					const fileElement = document.getElementById(fileId);
					if (fileElement) fileElement.scrollIntoView({ behavior: "smooth", block: "start" });
				}, 50);
			}, []);

			const handleFileSelect = useCallback((path: string, event: React.MouseEvent) => {
				const fileIndex = files.findIndex((f) => f.path === path);
				if (fileIndex === -1) return;
				const isMetaKey = event.metaKey || event.ctrlKey;
				const isShiftKey = event.shiftKey;
				setSelectedUnstagedFiles((prev) => {
					const next = new Set(prev);
					if (isShiftKey && lastSelectedFileIndex !== null) {
						next.clear();
						const start = Math.min(lastSelectedFileIndex, fileIndex);
						const end = Math.max(lastSelectedFileIndex, fileIndex);
						for (let i = start; i <= end; i++) next.add(files[i].path);
					} else if (isMetaKey) {
						if (next.has(path)) next.delete(path); else next.add(path);
					} else {
						if (next.size === 1 && next.has(path)) return prev;
						next.clear();
						next.add(path);
					}
					return next;
				});
				setLastSelectedFileIndex(fileIndex);
				scrollToFileIfNeeded(path);
			}, [lastSelectedFileIndex, files, scrollToFileIfNeeded]);

			const handleStageFiles = useCallback((paths: string[]) => {
				setStagedFiles((prev) => { const next = new Set(prev); paths.forEach((p) => next.add(p)); return next; });
				setSelectedUnstagedFiles(new Set());
			}, []);

			const handleStageFile = useCallback((path: string) => {
				if (selectedUnstagedFiles.size > 1 && selectedUnstagedFiles.has(path)) {
					handleStageFiles(Array.from(selectedUnstagedFiles));
				} else {
					handleStageFiles([path]);
				}
			}, [selectedUnstagedFiles, handleStageFiles]);

			const handleUnstageFile = useCallback((path: string) => {
				setStagedFiles((prev) => { const next = new Set(prev); next.delete(path); return next; });
				setSelectedStagedFiles(new Set());
			}, []);

			const handleUnstageAllFiles = useCallback(() => {
				setStagedFiles(new Set());
				setSelectedStagedFiles(new Set());
			}, []);

			const handleStagedFileSelect = useCallback((path: string, event: React.MouseEvent) => {
				const stagedFilesArray = files.filter((f) => stagedFiles.has(f.path));
				const fileIndex = stagedFilesArray.findIndex((f) => f.path === path);
				if (fileIndex === -1) return;
				const isMetaKey = event.metaKey || event.ctrlKey;
				const isShiftKey = event.shiftKey;
				setSelectedStagedFiles((prev) => {
					const next = new Set(prev);
					if (isShiftKey && lastSelectedStagedIndex !== null) {
						next.clear();
						const start = Math.min(lastSelectedStagedIndex, fileIndex);
						const end = Math.max(lastSelectedStagedIndex, fileIndex);
						for (let i = start; i <= end; i++) next.add(stagedFilesArray[i].path);
					} else if (isMetaKey) {
						if (next.has(path)) next.delete(path); else next.add(path);
					} else {
						if (next.size === 1 && next.has(path)) return prev;
						next.clear();
						next.add(path);
					}
					return next;
				});
				setLastSelectedStagedIndex(fileIndex);
			}, [stagedFiles, files, lastSelectedStagedIndex]);

			const toggleFileCollapse = useCallback((filePath: string) => {
				setCollapsedFiles((prev) => {
					const next = new Set(prev);
					if (next.has(filePath)) next.delete(filePath); else next.add(filePath);
					return next;
				});
			}, []);

			const toggleLargeDiff = useCallback((filePath: string) => {
				setExpandedLargeDiffs((prev) => {
					const next = new Set(prev);
					if (next.has(filePath)) next.delete(filePath); else next.add(filePath);
					return next;
				});
			}, []);

			const handleLineMouseDown = useCallback((e: React.MouseEvent, filePath: string, hunkIndex: number, lineIndex: number, lineContent: string, isStaged: boolean) => {
				if (e.button !== 0) return;
				e.preventDefault();
				e.stopPropagation();
				isDraggingRef.current = false;
				setIsSelecting(true);
				setSelectionAnchor({ filePath, hunkIndex, lineIndex });
				setDiffLineSelection({ filePath, lines: [{ hunkIndex, lineIndex, content: lineContent, isStaged }] });
				setCurrentDragLine({ filePath, hunkIndex, lineIndex });
				setContextMenuPosition(null);
			}, []);

			const handleLineMouseEnter = useCallback((filePath: string, hunkIndex: number, lineIndex: number) => {
				if (!isSelecting || !selectionAnchor || selectionAnchor.filePath !== filePath) return;
				const fileData = allFileHunks.get(filePath);
				if (!fileData) return;
				const newLines: DiffLineSelection["lines"] = [];
				const minHunk = Math.min(selectionAnchor.hunkIndex, hunkIndex);
				const maxHunk = Math.max(selectionAnchor.hunkIndex, hunkIndex);
				for (let h = minHunk; h <= maxHunk; h++) {
					const hunk = fileData.hunks[h];
					if (!hunk) continue;
					const startLine = h === minHunk ? (selectionAnchor.hunkIndex === minHunk ? selectionAnchor.lineIndex : 0) : 0;
					const endLine = h === maxHunk ? (hunkIndex === maxHunk ? lineIndex : hunk.lines.length - 1) : hunk.lines.length - 1;
					const actualStart = Math.min(startLine, endLine);
					const actualEnd = Math.max(startLine, endLine);
					for (let l = actualStart; l <= actualEnd; l++) {
						const line = hunk.lines[l];
						if (line) newLines.push({ hunkIndex: h, lineIndex: l, content: line, isStaged: false });
					}
				}
				if (selectionAnchor.hunkIndex !== hunkIndex || selectionAnchor.lineIndex !== lineIndex) isDraggingRef.current = true;
				setDiffLineSelection({ filePath, lines: newLines });
				setCurrentDragLine({ filePath, hunkIndex, lineIndex });
			}, [isSelecting, selectionAnchor, allFileHunks]);

			const handleLineMouseUp = useCallback(() => { setIsSelecting(false); }, []);

			const handleBackgroundClick = useCallback((e: React.MouseEvent) => {
				const target = e.target as HTMLElement;
				if (target.closest(".group\\/row")) return;
				if (target.closest("button, [role='button'], input, textarea, [role='checkbox'], [role='menuitem']")) return;
				setSelectedUnstagedFiles(new Set());
				setSelectedStagedFiles(new Set());
			}, []);

			const handleContextMenu = useCallback((e: React.MouseEvent) => {
				if (diffLineSelection && diffLineSelection.lines.length > 0) {
					e.preventDefault();
					setContextMenuPosition({ x: e.clientX, y: e.clientY });
				}
			}, [diffLineSelection]);

			const isLineSelected = useCallback((filePath: string, hunkIndex: number, lineIndex: number) => {
				if (!diffLineSelection || diffLineSelection.filePath !== filePath) return false;
				return diffLineSelection.lines.some((l) => l.hunkIndex === hunkIndex && l.lineIndex === lineIndex);
			}, [diffLineSelection]);

			useEffect(() => {
				const handleKeyDown = (e: KeyboardEvent) => {
					if (e.key === "Escape") { setContextMenuPosition(null); setDiffLineSelection(null); setCurrentDragLine(null); }
				};
				document.addEventListener("keydown", handleKeyDown);
				return () => document.removeEventListener("keydown", handleKeyDown);
			}, []);

			useEffect(() => {
				const handleClickOutside = () => { setContextMenuPosition(null); };
				if (contextMenuPosition) {
					document.addEventListener("click", handleClickOutside);
					return () => document.removeEventListener("click", handleClickOutside);
				}
			}, [contextMenuPosition]);

			useEffect(() => {
				const handleGlobalMouseUp = () => { if (isSelecting) setIsSelecting(false); };
				document.addEventListener("mouseup", handleGlobalMouseUp);
				return () => document.removeEventListener("mouseup", handleGlobalMouseUp);
			}, [isSelecting]);

			const addComment = useCallback((text: string) => {
				if (!text.trim() || !pendingComment) return;
				const newComment: LineComment = {
					id: uuidv4(), filePath: pendingComment.filePath, hunkId: pendingComment.hunkId,
					startLine: pendingComment.startLine, endLine: pendingComment.endLine,
					lineContent: pendingComment.lineContent, text: text.trim(),
					createdAt: new Date().toISOString(), lineSide: pendingComment.lineSide,
				};
				setComments((prev) => [...prev, newComment]);
				setHasUserAddedComments(true);
				setShowCommentInput(false);
				setPendingComment(null);
				setDiffLineSelection(null);
				setContextMenuPosition(null);
			}, [pendingComment]);

			const handleAddCommentFromSelection = useCallback(() => {
				if (!diffLineSelection || diffLineSelection.lines.length === 0) return;
				const { filePath } = diffLineSelection;
				const fileData = allFileHunks.get(filePath);
				if (!fileData) return;
				const lineContents: string[] = [];
				let minLineNum = Infinity;
				let maxLineNum = -Infinity;
				let lastHunkId = "";
				let lastLineIndex = 0;
				let hasOldLines = false;
				let hasNewLines = false;
				for (const line of diffLineSelection.lines) {
					const hunk = fileData.hunks[line.hunkIndex];
					if (!hunk) continue;
					const lineNumbers = computeHunkLineNumbers(hunk);
					const lineNum = lineNumbers[line.lineIndex]?.new ?? lineNumbers[line.lineIndex]?.old ?? line.lineIndex + 1;
					const lineNumObj = lineNumbers[line.lineIndex];
					minLineNum = Math.min(minLineNum, lineNum);
					maxLineNum = Math.max(maxLineNum, lineNum);
					lineContents.push(line.content);
					lastHunkId = hunk.id;
					lastLineIndex = line.lineIndex;
					if (lineNumObj?.old !== undefined) hasOldLines = true;
					if (lineNumObj?.new !== undefined) hasNewLines = true;
				}
				if (hasOldLines && hasNewLines) { setContextMenuPosition(null); return; }
				const commentLineSide: "old" | "new" = hasOldLines ? "old" : "new";
				setPendingComment({ filePath, hunkId: lastHunkId, displayAtLineIndex: lastLineIndex, startLine: minLineNum, endLine: maxLineNum, lineContent: lineContents, lineSide: commentLineSide });
				setShowCommentInput(true);
				setContextMenuPosition(null);
			}, [diffLineSelection, allFileHunks]);

			const cancelComment = useCallback(() => { setShowCommentInput(false); setPendingComment(null); }, []);
			const deleteComment = useCallback((commentId: string) => { setComments((prev) => prev.filter((c) => c.id !== commentId)); }, []);
			const startEditComment = useCallback((commentId: string) => { setEditingCommentId(commentId); }, []);
			const cancelEditComment = useCallback(() => { setEditingCommentId(null); }, []);
			const saveEditComment = useCallback((commentId: string, newText: string) => {
				if (!newText.trim()) return;
				setComments((prev) => prev.map((comment) => comment.id === commentId ? { ...comment, text: newText.trim() } : comment));
				setEditingCommentId(null);
			}, []);

			const saveConflictComment = useCallback(({ conflictId, filePath, conflictNumber, text }: { conflictId: string; filePath: string; conflictNumber: number; text: string }) => {
				if (!text.trim()) return;
				const comment: ConflictComment = { id: uuidv4(), conflictId, filePath, conflictNumber, text: text.trim(), createdAt: new Date().toISOString() };
				setConflictComments((prev) => { const next = new Map(prev); next.set(conflictId, comment); return next; });
			}, []);

			const clearConflictComment = useCallback((conflictId: string) => {
				setConflictComments((prev) => { const next = new Map(prev); next.delete(conflictId); return next; });
			}, []);

			const startEditConflictComment = useCallback((conflictId: string) => { setEditingConflictCommentId(conflictId); }, []);
			const cancelEditConflictComment = useCallback(() => { setEditingConflictCommentId(null); }, []);
			const saveEditConflictComment = useCallback((conflictId: string, newText: string) => {
				if (!newText.trim()) return;
				setConflictComments((prev) => {
					const next = new Map(prev);
					const existingComment = prev.get(conflictId);
					if (existingComment) next.set(conflictId, { ...existingComment, text: newText.trim() });
					return next;
				});
				setEditingConflictCommentId(null);
			}, []);

			const toggleConflictComment = useCallback((conflictId: string) => {
				setOpenConflictComments((prev) => {
					const next = new Set(prev);
					if (next.has(conflictId)) next.delete(conflictId); else next.add(conflictId);
					return next;
				});
			}, []);

			const handleCopyLineLocation = useCallback(async () => {
				try {
					if (!diffLineSelection || diffLineSelection.lines.length === 0) return;
					const { filePath } = diffLineSelection;
					const fileData = allFileHunks.get(filePath);
					if (!fileData) return;
					let minLineNum = Infinity;
					let maxLineNum = -Infinity;
					for (const line of diffLineSelection.lines) {
						const hunk = fileData.hunks[line.hunkIndex];
						if (!hunk) continue;
						const lineNumbers = computeHunkLineNumbers(hunk);
						const lineNum = lineNumbers[line.lineIndex]?.new ?? lineNumbers[line.lineIndex]?.old ?? line.lineIndex + 1;
						minLineNum = Math.min(minLineNum, lineNum);
						maxLineNum = Math.max(maxLineNum, lineNum);
					}
					const locationStr = minLineNum === maxLineNum ? `${filePath}:${minLineNum}` : `${filePath}:${minLineNum}-${maxLineNum}`;
					await navigator.clipboard.writeText(locationStr);
					setContextMenuPosition(null);
					addToast({ title: "Copied", description: "Line location copied to clipboard", type: "success" });
				} catch (error) {
					setContextMenuPosition(null);
					addToast({ description: error instanceof Error ? error.message : String(error), title: "Failed to copy", type: "error" });
				}
			}, [diffLineSelection, allFileHunks, addToast]);

			const handleCopyLines = useCallback(async () => {
				try {
					const lineContents = diffLineSelection?.lines?.map((l) => l.content).join("\n") || "";
					if (!lineContents) { setContextMenuPosition(null); return; }
					await navigator.clipboard.writeText(lineContents);
					setContextMenuPosition(null);
					addToast({ title: "Copied", description: "Lines copied to clipboard", type: "success" });
				} catch (error) {
					setContextMenuPosition(null);
					addToast({ description: error instanceof Error ? error.message : String(error), title: "Failed to copy", type: "error" });
				}
			}, [diffLineSelection, addToast]);

			const formatReviewMarkdown = useCallback(() => {
				let markdown = "";
				if (conflictComments.size > 0) {
					markdown += "## Conflict Resolution\n\n";
					for (const comment of conflictComments.values()) {
						if (comment.text.trim()) {
							const regions = conflictRegionsByFile.get(comment.filePath);
							const region = regions?.find((r) => r.conflict_number === comment.conflictNumber);
							let header = `### ${comment.filePath} - Conflict ${comment.conflictNumber}`;
							if (region) header += ` (lines ${region.start_line}-${region.end_line})`;
							markdown += `${header}\n`;
							markdown += `> ${comment.text}\n\n`;
						}
					}
				}
				if (comments.length > 0 || finalReviewComment.trim() || actualConflictedFiles.length > 0) {
					markdown += "## Code Review\n\n";
					if (actualConflictedFiles.length > 0) {
						markdown += "### Conflicted Files\n\n";
						for (const filePath of actualConflictedFiles) markdown += `- ${filePath}\n`;
						markdown += "\n";
					}
					if (finalReviewComment.trim()) { markdown += "### Summary\n"; markdown += `${finalReviewComment.trim()}\n\n`; }
					if (comments.length > 0) {
						markdown += "### Comments\n\n";
						const commentsByFile = comments.reduce((acc, comment) => {
							if (!acc[comment.filePath]) acc[comment.filePath] = [];
							acc[comment.filePath].push(comment);
							return acc;
						}, {} as Record<string, LineComment[]>);
						for (const [filePath, fileComments] of Object.entries(commentsByFile)) {
							for (const comment of fileComments) {
								const lineRef = comment.startLine === comment.endLine ? `${filePath}:${comment.startLine}` : `${filePath}:${comment.startLine}:${comment.endLine}`;
								markdown += `${lineRef}\n`;
								markdown += "```\n";
								markdown += `${comment.lineContent.join("\n")}\n`;
								markdown += "```\n";
								markdown += `> ${comment.text}\n\n`;
							}
						}
					}
				}
				return markdown;
			}, [comments, conflictComments, finalReviewComment, conflictRegionsByFile, actualConflictedFiles]);

			const handleRequestChanges = useCallback(async (mode: "plan" | "acceptEdits") => {
				setSendingReview(true);
				try {
					const markdown = formatReviewMarkdown();
					if (onCreateAgentWithReview) {
						await onCreateAgentWithReview(markdown, mode);
					} else {
						addToast({ title: "No handler provided", description: "onCreateAgentWithReview callback not available", type: "error" });
						return;
					}
					if (pendingFilesData) applyChangedFiles(pendingFilesData, true);
					if (pendingHunksData) setAllFileHunks(pendingHunksData);
					setPendingFilesData(null);
					setPendingHunksData(null);
					setStaleFiles(new Set());
					setComments([]);
					setConflictComments(new Map());
					setHasUserAddedComments(false);
					setFinalReviewComment("");
					setReviewPopoverOpen(false);
					if (repoPath && workspaceId !== undefined) await clearPendingReview(repoPath, workspaceId);
					onReviewSubmitted?.();
				} catch (error) {
					addToast({ description: error instanceof Error ? error.message : String(error), title: "Failed to send review", type: "error" });
				} finally {
					setSendingReview(false);
				}
			}, [onCreateAgentWithReview, formatReviewMarkdown, addToast, onReviewSubmitted, repoPath, workspaceId, pendingFilesData, pendingHunksData, applyChangedFiles]);

			const handleCancelReview = useCallback(async () => {
				try {
					setComments([]);
					setConflictComments(new Map());
					setHasUserAddedComments(false);
					setFinalReviewComment("");
					setShowCancelDialog(false);
					setReviewPopoverOpen(false);
					if (repoPath && workspaceId !== undefined) await clearPendingReview(repoPath, workspaceId);
					addToast({ title: "Review canceled", description: "All comments have been discarded", type: "success" });
				} catch (error) {
					addToast({ description: error instanceof Error ? error.message : String(error), title: "Failed to cancel review", type: "error" });
				}
			}, [repoPath, workspaceId, addToast]);

			const handleCopyReview = useCallback(async () => {
				try {
					const markdown = formatReviewMarkdown();
					await navigator.clipboard.writeText(markdown);
					setCopiedReview(true);
					setTimeout(() => setCopiedReview(false), 2000);
				} catch (error) {
					addToast({ description: error instanceof Error ? error.message : String(error), title: "Failed to copy", type: "error" });
				}
			}, [formatReviewMarkdown, addToast]);

			const handleCommit = useCallback(async (commitMsg: string) => {
				if (!commitMsg) { addToast({ title: "Commit message", description: "Enter a commit message.", type: "error" }); return; }
				if (commitMsg.length > 500) { addToast({ title: "Commit message", description: "Please keep the message under 500 characters.", type: "error" }); return; }
				setCommitPending(true);
				try {
					const stagedPaths = Array.from(stagedFiles);
					const hasStagedFiles = stagedPaths.length > 0;
					let result: string;
					if (hasStagedFiles) {
						result = await jjSplit(workspacePath, commitMsg, stagedPaths);
						setStagedFiles(new Set());
					} else {
						result = await createCommit(repoPath!, workspaceId ?? null, commitMsg);
					}
					await invalidateCache();
					addToast({ title: "Commit created", description: result.trim() || "Commit successful", type: "success" });
					await Promise.all([loadChangedFiles(), refreshCommittedChanges()]);
				} catch (error) {
					addToast({ title: "Commit failed", description: error instanceof Error ? error.message : String(error), type: "error" });
				} finally {
					setCommitPending(false);
				}
			}, [workspacePath, addToast, invalidateCache, stagedFiles, loadChangedFiles, refreshCommittedChanges]);

			const toggleSectionCollapse = useCallback((sectionId: string) => {
				setCollapsedSections((prev) => {
					const next = new Set(prev);
					if (next.has(sectionId)) next.delete(sectionId); else next.add(sectionId);
					return next;
				});
			}, []);

			const isCommentOutdated = useCallback((comment: LineComment): boolean => {
				const fileData = allFileHunks.get(comment.filePath);
				if (!fileData || fileData.isLoading || !fileData.hunks) return false;
				const hunk = fileData.hunks.find((h) => h.id === comment.hunkId);
				if (!hunk) return true;
				const lineNumbers = computeHunkLineNumbers(hunk);
				const hasMatchingLine = lineNumbers.some((ln) => {
					const actualNum = ln.new ?? ln.old;
					const inRange = actualNum && actualNum >= comment.startLine && actualNum <= comment.endLine;
					if (!inRange) return false;
					if (comment.lineSide) {
						const lineSide: "old" | "new" = ln.old !== undefined && ln.new === undefined ? "old" : "new";
						return comment.lineSide === lineSide;
					}
					return true;
				});
				return !hasMatchingLine;
			}, [allFileHunks]);

			const getOutdatedCommentsForFile = useCallback((filePath: string): LineComment[] =>
				comments.filter((c) => c.filePath === filePath && isCommentOutdated(c)),
			[comments, isCommentOutdated]);

			const getAllOutdatedComments = useCallback((): LineComment[] => comments.filter((c) => isCommentOutdated(c)), [comments, isCommentOutdated]);

			const handleCopyOutdatedComments = useCallback(async () => {
				const outdated = getAllOutdatedComments();
				if (outdated.length === 0) return;
				const markdown = outdated.map((c) => {
					const lineRef = c.startLine === c.endLine ? `${c.filePath}:${c.startLine}` : `${c.filePath}:${c.startLine}-${c.endLine}`;
					const codeBlock = c.lineContent.length > 0 ? `\n\`\`\`\n${c.lineContent.join("\n")}\n\`\`\`\n` : "";
					return `**${lineRef}**${codeBlock}${c.text}`;
				}).join("\n\n");
				try {
					await navigator.clipboard.writeText(markdown);
					addToast({ title: "Copied", description: `${outdated.length} outdated comment${outdated.length > 1 ? "s" : ""} copied to clipboard`, type: "success" });
				} catch {
					addToast({ title: "Copy failed", description: "Could not copy to clipboard", type: "error" });
				}
			}, [getAllOutdatedComments, addToast]);

			const getCommentsForLine = useCallback((filePath: string, hunkId: string, actualLineNum: number, currentLineSide: "old" | "new") =>
				comments.filter((c) =>
					c.filePath === filePath && c.hunkId === hunkId && actualLineNum >= c.startLine && actualLineNum <= c.endLine &&
					!isCommentOutdated(c) && (c.lineSide === undefined || c.lineSide === currentLineSide),
				),
			[comments, isCommentOutdated]);

			const handleExpandContext = useCallback(async (filePath: string, hunkIndex: number, direction: "before" | "after") => {
				const hunk = allFileHunks.get(filePath)?.hunks[hunkIndex];
				if (!hunk) return;
				const key = `${filePath}:${hunkIndex}:${direction}`;
				const existing = expandedContext.get(key) || [];
				const LINES_TO_FETCH = 20;
				const { newStart, newCount } = parseHunkHeader(hunk.header);
				let startLine: number;
				let endLine: number;
				if (direction === "before") {
					const hunkStartLine = newStart;
					endLine = hunkStartLine - 1 - existing.length;
					startLine = Math.max(1, endLine - LINES_TO_FETCH + 1);
					if (startLine > endLine) return;
				} else {
					const hunkEndLine = newStart + newCount - 1;
					startLine = hunkEndLine + 1 + existing.length;
					endLine = startLine + LINES_TO_FETCH - 1;
				}
				try {
					const result = await getWorkspaceFileLines(repoPath ?? "", workspaceId ?? null, filePath, false, startLine, endLine);
					if (result.lines.length > 0) {
						setExpandedContext((prev) => {
							const next = new Map(prev);
							const prevLines = prev.get(key) || [];
							if (direction === "before") next.set(key, [...result.lines, ...prevLines]);
							else next.set(key, [...prevLines, ...result.lines]);
							return next;
						});
					}
				} catch {}
			}, [workspacePath, expandedContext, allFileHunks]);

			const hunkLinesProps = useMemo(() => ({
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
			}), [
				conflictLineLookups, firstConflictRegionIdByFile, expandedContext,
				conflictComments, openConflictComments, editingConflictCommentId,
				searchData, debouncedSearchQuery, currentMatchIndex, diffLineSelection,
				showCommentInput, pendingComment, editingCommentId, comments,
				conflictFileRefs, diffFontSize, handleExpandContext, handleLineMouseDown,
				handleLineMouseEnter, handleLineMouseUp, handleAddCommentFromSelection,
				isLineSelected, saveConflictComment, clearConflictComment, toggleConflictComment,
				setOpenConflictComments, startEditConflictComment, cancelEditConflictComment,
				saveEditConflictComment, addComment, cancelComment, deleteComment,
				startEditComment, cancelEditComment, saveEditComment, setPendingComment,
				setShowCommentInput, getCommentsForLine,
			]);

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

			const unstagedFiles = files.filter((f) => !stagedFiles.has(f.path));
			const stagedFilesList = files.filter((f) => stagedFiles.has(f.path));

			const handleStageAllFiles = useCallback(() => {
				const unstagedPaths = unstagedFiles.map((f) => f.path);
				if (unstagedPaths.length === 0) return;
				setStagedFiles((prev) => { const next = new Set(prev); unstagedPaths.forEach((path) => next.add(path)); return next; });
				setSelectedUnstagedFiles(new Set());
				setLastSelectedFileIndex(null);
			}, [unstagedFiles]);

			const handleSelectAllUnstaged = useCallback(() => {
				setSelectedUnstagedFiles((prev) => {
					if (prev.size === unstagedFiles.length && unstagedFiles.length > 0) return new Set();
					return new Set(unstagedFiles.map((f) => f.path));
				});
				if (unstagedFiles.length > 0) setLastSelectedFileIndex(files.findIndex((f) => f.path === unstagedFiles[unstagedFiles.length - 1].path));
			}, [unstagedFiles, files]);

			const handleSelectAllStaged = useCallback(() => {
				setSelectedStagedFiles((prev) => {
					if (prev.size === stagedFilesList.length && stagedFilesList.length > 0) return new Set();
					return new Set(stagedFilesList.map((f) => f.path));
				});
				if (stagedFilesList.length > 0) setLastSelectedStagedIndex(stagedFilesList.length - 1);
			}, [files, stagedFilesList]);

			useKeyboardShortcut("a", true, () => {
				if (selectedStagedFiles.size > 0) {
					setSelectedStagedFiles(new Set(stagedFilesList.map((f) => f.path)));
					if (stagedFilesList.length > 0) setLastSelectedStagedIndex(stagedFilesList.length - 1);
				} else {
					setSelectedUnstagedFiles(new Set(unstagedFiles.map((f) => f.path)));
					if (unstagedFiles.length > 0) setLastSelectedFileIndex(files.findIndex((f) => f.path === unstagedFiles[unstagedFiles.length - 1].path));
				}
			}, [selectedStagedFiles, stagedFilesList, unstagedFiles, files]);

			const hasConflicts = actualConflictedFiles.length > 0;
			const totalComments = comments.length + conflictComments.size;
			const showActionBar = hasConflicts || comments.length > 0;

			return (
				<div className="flex h-full overflow-hidden" onClick={handleBackgroundClick}>
					<div className="w-60 border-r border-border bg-sidebar flex flex-col">
						<CommitInput
							ref={commitInputRef}
							onCommit={handleCommit}
							disabled={readOnly || files.length === 0}
							pending={commitPending}
							selectedFileCount={stagedFiles.size}
							totalFileCount={files.length}
						/>
						<div className="flex-1 overflow-y-auto px-4 pb-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full">
							{initialLoading ? (
								<div className="flex items-center justify-center h-full">
									<Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
								</div>
							) : (
								<>
									{actualConflictedFiles.length > 0 && (
										<ConflictsSection
											files={actualConflictedFiles}
											isCollapsed={collapsedSections.has("conflicts")}
											onToggleCollapse={() => toggleSectionCollapse("conflicts")}
											activeFilePath={activeFilePath}
											onFileSelect={(path) => {
												setActiveFilePath(path);
												setLargeChangesetExpanded(true);
												setCollapsedFiles((prev) => { const next = new Set(prev); next.delete(path); return next; });
												setExpandedLargeDiffs((prev) => { const next = new Set(prev); next.add(path); return next; });
												setTimeout(() => {
													const el = conflictFileRefs.current.get(path);
													if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
												}, 50);
											}}
										/>
									)}
									{files.length === 0 && !(showCommittedChanges && committedFiles.length > 0) ? (
										<div className="flex flex-col items-center justify-center h-full text-center py-12">
											<CheckCircle2 className="w-12 h-12 text-muted-foreground/40 mb-3" />
											<p className="text-sm text-muted-foreground">No changes</p>
										</div>
									) : files.length > 0 ? (
										<>
											{stagedFilesList.length > 0 && (
												<ChangesSection
													title="Selected"
													files={stagedFilesList}
													isCollapsed={collapsedSections.has("staged")}
													onToggleCollapse={() => toggleSectionCollapse("staged")}
													activeFilePath={activeFilePath}
													selectedFiles={selectedStagedFiles}
													lastSelectedPath={lastSelectedStagedIndex !== null && stagedFilesList[lastSelectedStagedIndex] ? stagedFilesList[lastSelectedStagedIndex].path : null}
													onFileSelect={handleStagedFileSelect}
													onSelectAll={handleSelectAllStaged}
													onUnstage={handleUnstageFile}
													onUnstageAll={handleUnstageAllFiles}
													onDeselectAll={() => setSelectedStagedFiles(new Set())}
													isStaged={true}
													workspacePath={workspacePath}
												/>
											)}
											<ChangesSection
												title="Changes"
												files={unstagedFiles}
												isCollapsed={collapsedSections.has("changes")}
												onToggleCollapse={() => toggleSectionCollapse("changes")}
												fileActionTarget={fileActionTarget}
												activeFilePath={activeFilePath}
												selectedFiles={selectedUnstagedFiles}
												lastSelectedPath={lastSelectedFileIndex !== null && files[lastSelectedFileIndex] ? files[lastSelectedFileIndex].path : null}
												onFileSelect={handleFileSelect}
												onMoveToWorkspace={() => { onMoveFilesToNewWorkspace?.(Array.from(selectedUnstagedFiles)); }}
												onDiscardAll={handleDiscardAll}
												onDiscard={handleDiscardFiles}
												onDeselectAll={() => setSelectedUnstagedFiles(new Set())}
												onSelectAll={handleSelectAllUnstaged}
												onStage={handleStageFile}
												onStageAll={handleStageAllFiles}
												workspacePath={workspacePath}
											/>
										</>
									) : null}
									{showCommittedChanges && committedFiles.length > 0 && (
										<CommittedChangesSection
											files={committedFiles}
											isCollapsed={committedSectionCollapsed}
											onToggleCollapse={() => setCommittedSectionCollapsed(!committedSectionCollapsed)}
											activeFilePath={activeFilePath}
											onFileSelect={(path, event) => { event.preventDefault(); setActiveFilePath(path); scrollToFileIfNeeded(path); }}
											workspacePath={workspacePath}
										/>
									)}
								</>
							)}
						</div>
					</div>

					<div className="flex-1 flex flex-col min-w-0">
						{showActionBar && (
							<div className="sticky top-0 z-10 flex items-center justify-between px-4 py-2 bg-muted/80 backdrop-blur-sm border-b border-border">
								<div className="flex items-center gap-2 text-sm">
									<MessageSquare className={`w-4 h-4 ${hasConflicts ? "text-destructive" : "text-primary"}`} />
									<span className="text-muted-foreground">{totalComments} comment{totalComments !== 1 ? "s" : ""} pending</span>
								</div>
								<div className="flex items-center gap-2">
									<Button size="sm" variant="outline" onClick={() => setShowCancelDialog(true)}>
										{hasConflicts ? "Reset" : "Discard"}
									</Button>
									<Popover open={reviewPopoverOpen} onOpenChange={setReviewPopoverOpen}>
										<PopoverTrigger asChild>
											<Button size="sm" variant="default" className={cn("gap-2", hasConflicts && "bg-destructive hover:bg-destructive/90 text-destructive-foreground")}>
												<Send className="w-3 h-3" />
												{hasConflicts ? "Resolve conflicts..." : "Finish review"}
											</Button>
										</PopoverTrigger>
										<PopoverContent align="end" side="bottom" className="w-80 relative">
											<TooltipProvider>
												<Tooltip>
													<TooltipTrigger asChild>
														<Button size="icon" variant="ghost" className="h-8 w-8 absolute top-2 right-2" onClick={() => setReviewPopoverOpen(false)} disabled={sendingReview}>
															<X className="w-4 h-4" />
														</Button>
													</TooltipTrigger>
													<TooltipContent>Close</TooltipContent>
												</Tooltip>
											</TooltipProvider>
											<div className="space-y-3">
												<div>
													<h4 className="font-medium text-sm mb-1">{hasConflicts ? "Resolve conflicts" : "Finish your review"}</h4>
													<p className="text-sm text-muted-foreground">{totalComments} comment{totalComments !== 1 ? "s" : ""} will be submitted.</p>
												</div>
												<Textarea value={finalReviewComment} onChange={(event) => setFinalReviewComment(event.target.value)} placeholder="Add a summary comment (optional)..." className="min-h-[80px] text-sm" />
												<div className="flex justify-between gap-2">
													<Button size="sm" variant="outline" onClick={handleCopyReview} className="gap-2" disabled={sendingReview}>
														{copiedReview ? (<><Check className="w-3 h-3" />Copied</>) : (<><Copy className="w-3 h-3" />Copy</>)}
													</Button>
													<div className="flex gap-2">
														<Button size="sm" variant="secondary" onClick={() => handleRequestChanges("plan")} disabled={sendingReview}>Plan</Button>
														<Button size="sm" onClick={() => handleRequestChanges("acceptEdits")} disabled={sendingReview}>Edit</Button>
													</div>
												</div>
											</div>
										</PopoverContent>
									</Popover>
								</div>
							</div>
						)}

						<AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>Discard review?</AlertDialogTitle>
									<AlertDialogDescription>
										This will discard all {comments.length} pending comment{comments.length !== 1 ? "s" : ""}. This action cannot be undone.
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel>Keep reviewing</AlertDialogCancel>
									<AlertDialogAction onClick={handleCancelReview}>Discard</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>

						{staleFiles.size > 0 && (
							<div className="flex items-center justify-between px-4 py-2 bg-amber-500/15 border-b border-amber-500/40">
								<div className="flex items-center gap-2 text-sm">
									<AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-300" />
									<span className="text-amber-800 dark:text-amber-200">{staleFiles.size} file{staleFiles.size !== 1 ? "s" : ""} changed since you started reviewing</span>
									<span className="text-sm text-amber-700/80 dark:text-amber-300/80">({Array.from(staleFiles).slice(0, 3).map(getFileName).join(", ")}{staleFiles.size > 3 ? ` +${staleFiles.size - 3} more` : ""})</span>
								</div>
								<div className="flex items-center gap-2">
									{getAllOutdatedComments().length > 0 && (
										<Button size="sm" variant="outline" className="gap-1.5 border-amber-500/60 text-amber-800 dark:text-amber-200 hover:bg-amber-500/25" onClick={handleCopyOutdatedComments}>
											<Copy className="w-3 h-3" />
											Copy Outdated ({getAllOutdatedComments().length})
										</Button>
									)}
									<Button size="sm" variant="outline" className="gap-1.5 border-amber-500/60 text-amber-800 dark:text-amber-200 hover:bg-amber-500/25" onClick={handleReloadWithPendingChanges}>
										<RefreshCw className="w-3 h-3" />
										Reload
									</Button>
								</div>
							</div>
						)}

						<div className="flex-1 overflow-hidden relative">
							<SearchOverlay
								isVisible={isSearchOpen}
								query={searchQuery}
								onQueryChange={(q) => { setSearchQuery(q); setCurrentMatchIndex(0); }}
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
							) : files.length === 0 && !(showCommittedChanges && committedFiles.length > 0) ? (
								<div className="h-full flex flex-col items-center justify-center text-muted-foreground">
									<CheckCircle2 className="w-12 h-12 mb-3 text-muted-foreground/40" />
									<p className="text-sm">No changes to review</p>
								</div>
							) : (
								(() => {
									let totalLines = 0;
									for (const [, fileData] of allFileHunks) {
										if (!fileData.isLoading && fileData.hunks) {
											for (const hunk of fileData.hunks) totalLines += hunk.lines.length;
										}
									}
									if (totalLines > 1000 && !largeChangesetExpanded) {
										return (
											<div className="h-full flex flex-col items-center justify-center gap-4 text-muted-foreground">
												<FileText className="w-12 h-12 opacity-50" />
												<div className="text-center">
													<p className="font-medium mb-1">Large changeset</p>
													<p className="text-sm">{totalLines} lines across {files.length} file{files.length !== 1 ? "s" : ""}</p>
												</div>
												<Button variant="outline" onClick={() => setLargeChangesetExpanded(true)}>View changes</Button>
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
																<div key={`conflict-${conflictFile}`} className="border border-destructive/30 rounded-md overflow-hidden">
																	<div className="bg-destructive/10 px-3 py-2 flex items-center gap-2">
																		<span className="font-mono text-sm">{conflictFile}</span>
																	</div>
																	{regions.map((region, index) => (
																		<Fragment key={region.id}>
																			{index > 0 && <div className="border-t border-border" />}
																			<InlineConflictCard
																				region={region}
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
												{showCommittedChanges && committedFiles.map((file) => (
													<FileRowComponent
														key={`committed-${file.path}`}
														file={{ ...file, stagedStatus: "", workspaceStatus: file.status, isUntracked: false } as ParsedFileChange}
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
					</div>

					{contextMenuPosition && diffLineSelection && diffLineSelection.lines.length > 0 && (
						<div
							className="fixed z-50 bg-popover border border-border rounded-md shadow-lg py-1 min-w-[180px]"
							style={{ left: contextMenuPosition.x, top: contextMenuPosition.y }}
							onClick={(event) => event.stopPropagation()}
						>
							<button className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent flex items-center gap-2" onClick={handleAddCommentFromSelection}>
								<MessageSquare className="w-4 h-4" />
								Add comment
							</button>
							<button className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent flex items-center gap-2" onClick={handleCopyLineLocation} data-testid="copy-line-location">
								<Copy className="w-4 h-4" />
								Copy line location
							</button>
							<button className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent flex items-center gap-2" onClick={handleCopyLines} data-testid="copy-lines">
								<Copy className="w-4 h-4" />
								Copy lines
							</button>
						</div>
					)}
				</div>
			);
		},
	),
);

ChangesDiffViewer.displayName = "ChangesDiffViewer";

export default ChangesDiffViewer;
